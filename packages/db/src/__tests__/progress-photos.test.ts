import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, first, resetTestDb } from "./test-db";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const PHOTO = "33333333-3333-3333-3333-333333333333";

const THUMB = `${USER_A}/${PHOTO}/thumb.jpg`;
const ORIGINAL = `${USER_A}/${PHOTO}/original.jpg`;

// Issue #835: who can read a progress photo's row and its bytes.
describe.skipIf(!process.env.TEST_DATABASE_URL)("progress photos: table and Storage RLS", () => {
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = await resetTestDb();
    await admin`INSERT INTO auth.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
    await admin`INSERT INTO public.users (id, email) VALUES (${USER_A}, 'a@example.com'), (${USER_B}, 'b@example.com')`;
    await admin`INSERT INTO progress_photos
      (id, user_id, taken_on, pose, width, height, thumb_path, original_path)
      VALUES (${PHOTO}, ${USER_A}, '2026-03-10', 'front', 1536, 2048, ${THUMB}, ${ORIGINAL})`;
    await admin`INSERT INTO storage.objects (bucket_id, name, owner)
      VALUES ('progress-photos', ${THUMB}, ${USER_A}), ('progress-photos', ${ORIGINAL}, ${USER_A})`;
  }, 30_000);

  afterAll(async () => {
    await admin.end();
  });

  it("creates a private, JPEG-only bucket", async () => {
    const bucket = first(
      await admin<{ public: boolean; allowed_mime_types: string[] }[]>`
        SELECT public, allowed_mime_types FROM storage.buckets WHERE id = 'progress-photos'`,
    );
    expect(bucket.public).toBe(false);
    expect(bucket.allowed_mime_types).toEqual(["image/jpeg"]);
  });

  describe("progress_photos rows", () => {
    it("lets the owner read their photo and nobody else", async () => {
      expect(await asUser(admin, USER_A, (tx) => tx`SELECT id FROM progress_photos`)).toHaveLength(
        1,
      );
      expect(await asUser(admin, USER_B, (tx) => tx`SELECT id FROM progress_photos`)).toHaveLength(
        0,
      );
      expect(await asUser(admin, null, (tx) => tx`SELECT id FROM progress_photos`)).toHaveLength(0);
    });

    it("refuses a row written for another user, and cannot touch another user's row", async () => {
      await expect(
        asUser(
          admin,
          USER_B,
          (tx) => tx`INSERT INTO progress_photos
            (user_id, taken_on, width, height, thumb_path, original_path)
            VALUES (${USER_A}, '2026-03-11', 10, 10, 'x', 'y')`,
        ),
      ).rejects.toThrow(/row-level security/);

      const updated = await asUser(
        admin,
        USER_B,
        (tx) => tx`UPDATE progress_photos SET note = 'mine now' WHERE id = ${PHOTO} RETURNING id`,
      );
      expect(updated).toHaveLength(0);
      const deleted = await asUser(
        admin,
        USER_B,
        (tx) => tx`DELETE FROM progress_photos WHERE id = ${PHOTO} RETURNING id`,
      );
      expect(deleted).toHaveLength(0);
    });

    it("rejects an unknown pose", async () => {
      await expect(
        admin`INSERT INTO progress_photos
          (user_id, taken_on, pose, width, height, thumb_path, original_path)
          VALUES (${USER_A}, '2026-03-12', 'upside-down', 10, 10, 'x', 'y')`,
      ).rejects.toThrow(/progress_photos_pose_valid/);
    });
  });

  describe("Storage objects", () => {
    it("lets the owner list their own objects", async () => {
      const own = await asUser(
        admin,
        USER_A,
        (tx) => tx<{ name: string }[]>`SELECT name FROM storage.objects ORDER BY name`,
      );
      expect(own.map((row) => row.name)).toEqual([ORIGINAL, THUMB].sort());
    });

    it("lets the owner store and remove an object under their prefix", async () => {
      const key = `${USER_A}/new-photo/thumb.jpg`;
      const stored = await asUser(admin, USER_A, async (tx) => {
        await tx`INSERT INTO storage.objects (bucket_id, name, owner)
          VALUES ('progress-photos', ${key}, ${USER_A})`;
        return tx`DELETE FROM storage.objects WHERE bucket_id = 'progress-photos' AND name = ${key} RETURNING name`;
      });
      expect(stored).toHaveLength(1);
    });

    it("hides another user's objects from select", async () => {
      const seen = await asUser(admin, USER_B, (tx) => tx`SELECT name FROM storage.objects`);
      expect(seen).toHaveLength(0);
      const anon = await asUser(admin, null, (tx) => tx`SELECT name FROM storage.objects`);
      expect(anon).toHaveLength(0);
    });

    it("refuses an insert under another user's prefix, however the path is shaped", async () => {
      for (const name of [
        `${USER_A}/${PHOTO}/extra.jpg`,
        `${USER_A}/anything.jpg`,
        `${USER_B}.jpg`, // no folder at all
        `x/${USER_A}/y.jpg`, // the owner's id is not the first segment
      ]) {
        await expect(
          asUser(
            admin,
            USER_B,
            (tx) => tx`INSERT INTO storage.objects (bucket_id, name, owner)
              VALUES ('progress-photos', ${name}, ${USER_B})`,
          ),
          name,
        ).rejects.toThrow(/row-level security/);
      }
    });

    it("refuses to delete another user's objects, and the objects survive", async () => {
      const deleted = await asUser(
        admin,
        USER_B,
        (tx) => tx`DELETE FROM storage.objects WHERE bucket_id = 'progress-photos' RETURNING name`,
      );
      expect(deleted).toHaveLength(0);
      const remaining = first(
        await admin<{ count: number }[]>`
          SELECT count(*)::int AS count FROM storage.objects WHERE bucket_id = 'progress-photos'`,
      );
      expect(remaining.count).toBe(2);
    });

    it("never lets anyone overwrite an object (no update policy)", async () => {
      const updated = await asUser(
        admin,
        USER_A,
        (tx) =>
          tx`UPDATE storage.objects SET name = ${`${USER_A}/${PHOTO}/other.jpg`} WHERE name = ${THUMB} RETURNING name`,
      );
      expect(updated).toHaveLength(0);
    });

    it("leaves other buckets alone", async () => {
      await admin`INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', false)`;
      await expect(
        asUser(
          admin,
          USER_A,
          (tx) => tx`INSERT INTO storage.objects (bucket_id, name, owner)
            VALUES ('avatars', ${`${USER_A}/me.jpg`}, ${USER_A})`,
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });
});
