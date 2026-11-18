import { type JimDatabase, createTestDb } from "@/lib/db/schema";
import { resetTestDb } from "@/lib/test/test-db";
import type postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteProgressPhoto, saveProgressPhoto, updateProgressPhoto } from "..";
import { runSyncCycle } from "../../sync/engine";
import type { PhotoStorage } from "../storage";
import { drainPhotoUploads } from "../upload-queue";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

let claimsSub = USER_A;
const removed: { bucket: string; paths: string[] }[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: claimsSub } } }) },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          removed.push({ bucket, paths });
          return { error: null };
        },
      }),
    },
  }),
}));

const { POST: push } = await import("../../../app/api/sync/push/route");
const { GET: pull } = await import("../../../app/api/sync/pull/route");

const routeFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input), "http://localhost");
  if (url.pathname === "/api/sync/push") return push(new Request(url, init));
  if (url.pathname === "/api/sync/pull") return pull(new Request(url, init));
  throw new Error(`Unhandled fetch in test: ${url}`);
};

const storage: PhotoStorage = {
  upload: async () => ({ error: null }),
  signedUrl: async () => null,
};

const photo = () => ({
  original: new Blob(["original"]),
  thumb: new Blob(["thumb"]),
  width: 1536,
  height: 2048,
  capturedAt: null,
});

// Issue #835: progress photo metadata syncs like the other low-volume tables,
// and deleting one removes its bytes from Storage.
describe.skipIf(!process.env.TEST_DATABASE_URL)("progress photos: sync and deletion", () => {
  let admin: postgres.Sql;
  let phone: JimDatabase;
  let newPhone: JimDatabase;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    admin = await resetTestDb();
    await admin`INSERT INTO auth.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
    await admin`INSERT INTO public.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  beforeEach(() => {
    claimsSub = USER_A;
    removed.length = 0;
    phone = createTestDb(`jim-phone-${crypto.randomUUID()}`);
    newPhone = createTestDb(`jim-new-phone-${crypto.randomUUID()}`);
  });

  it("round-trips a photo to a new phone after sign-in, and stays private", async () => {
    const saved = await saveProgressPhoto(
      {
        userId: USER_A,
        photo: photo(),
        takenOn: "2026-03-10",
        pose: "side",
        note: "end of cut",
      },
      phone,
    );
    await drainPhotoUploads(phone, storage);
    await runSyncCycle(phone, routeFetch);
    expect(await phone.outbox.count()).toBe(0);

    const [row] = await admin<
      { pose: string; note: string; taken_on: string; uploaded_at: string | null; width: number }[]
    >`SELECT pose, note, to_char(taken_on, 'YYYY-MM-DD') AS taken_on, uploaded_at, width
      FROM progress_photos WHERE id = ${saved.id}`;
    expect(row).toMatchObject({
      pose: "side",
      note: "end of cut",
      taken_on: "2026-03-10",
      width: 1536,
    });
    expect(row?.uploaded_at).not.toBeNull();

    await runSyncCycle(newPhone, routeFetch);
    const arrived = await newPhone.progressPhotos.get(saved.id);
    expect(arrived).toMatchObject({
      takenOn: "2026-03-10",
      pose: "side",
      note: "end of cut",
      thumbPath: `${USER_A}/${saved.id}/thumb.jpg`,
    });
    expect(arrived?.takenAt).toBeInstanceOf(Date);
    expect(arrived?.uploadedAt).toBeInstanceOf(Date);

    claimsSub = USER_B;
    const strangerPhone = createTestDb(`jim-stranger-${crypto.randomUUID()}`);
    await runSyncCycle(strangerPhone, routeFetch);
    expect(await strangerPhone.progressPhotos.count()).toBe(0);
  });

  it("syncs an edit last-write-wins", async () => {
    const saved = await saveProgressPhoto(
      { userId: USER_A, photo: photo(), takenOn: "2026-03-11" },
      phone,
    );
    await drainPhotoUploads(phone, storage);
    await runSyncCycle(phone, routeFetch);
    await updateProgressPhoto(
      (await phone.progressPhotos.get(saved.id)) ?? saved,
      { pose: "back", note: "morning" },
      phone,
    );
    await runSyncCycle(phone, routeFetch);

    const [row] = await admin<{ pose: string; note: string }[]>`
      SELECT pose, note FROM progress_photos WHERE id = ${saved.id}`;
    expect(row).toEqual({ pose: "back", note: "morning" });
  });

  it("removes both Storage objects when a delete is pushed, and not on an edit", async () => {
    const saved = await saveProgressPhoto(
      { userId: USER_A, photo: photo(), takenOn: "2026-03-12" },
      phone,
    );
    await drainPhotoUploads(phone, storage);
    await runSyncCycle(phone, routeFetch);
    expect(removed).toEqual([]);

    await deleteProgressPhoto((await phone.progressPhotos.get(saved.id)) ?? saved, phone);
    await runSyncCycle(phone, routeFetch);

    expect(removed).toEqual([
      {
        bucket: "progress-photos",
        paths: [`${USER_A}/${saved.id}/thumb.jpg`, `${USER_A}/${saved.id}/original.jpg`],
      },
    ]);
    const [row] = await admin<{ deleted_at: string | null }[]>`
      SELECT deleted_at FROM progress_photos WHERE id = ${saved.id}`;
    expect(row?.deleted_at).not.toBeNull();
  });

  it("derives the removed paths from the signed-in user, never from the payload", async () => {
    const saved = await saveProgressPhoto(
      { userId: USER_A, photo: photo(), takenOn: "2026-03-13" },
      phone,
    );
    const now = new Date().toISOString();
    const response = await push(
      new Request("http://localhost/api/sync/push", {
        method: "POST",
        body: JSON.stringify({
          mutations: [
            {
              id: crypto.randomUUID(),
              table: "progressPhotos",
              entity: {
                ...saved,
                takenAt: now,
                updatedAt: now,
                deletedAt: now,
                thumbPath: `${USER_B}/other/thumb.jpg`,
                originalPath: `${USER_B}/other/original.jpg`,
              },
            },
          ],
        }),
      }),
    );
    expect((await response.json()).results[0].status).toBe("applied");
    expect(removed[0]?.paths).toEqual([
      `${USER_A}/${saved.id}/thumb.jpg`,
      `${USER_A}/${saved.id}/original.jpg`,
    ]);
  });
});
