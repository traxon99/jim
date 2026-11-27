import "fake-indexeddb/auto";
import { createTestDb } from "@/lib/db/schema";
import { afterEach, describe, expect, it } from "vitest";
import {
  GymCardGoneError,
  addGymCard,
  cleanGymCardInput,
  deleteGymCard,
  primaryGymCard,
  updateGymCard,
} from "..";
import { drawGymCardSvg, gymCardSvg } from "../render";

const USER = "11111111-1111-1111-1111-111111111111";
let counter = 0;
const databases: ReturnType<typeof createTestDb>[] = [];
function freshDb() {
  counter += 1;
  const database = createTestDb(`gym-cards-${counter}`);
  databases.push(database);
  return database;
}

afterEach(async () => {
  for (const database of databases.splice(0)) await database.delete();
});

const input = {
  name: " Iron Temple ",
  format: "code39" as const,
  code: " 00048213 ",
  color: "#B3261E",
  gymId: null,
};

describe("gym cards on the phone (#878)", () => {
  it("cleans a card before saving it", () => {
    expect(cleanGymCardInput(input)).toEqual({
      ok: true,
      card: {
        name: "Iron Temple",
        format: "code39",
        code: "00048213",
        color: "#b3261e",
        gymId: null,
      },
    });
    expect(cleanGymCardInput({ ...input, name: " " })).toEqual({
      ok: false,
      error: "Give the card a name",
    });
    expect(cleanGymCardInput({ ...input, format: "ean13", code: "123" }).ok).toBe(false);
  });

  it("keeps a scanned code exactly, and tidies only a typed one", async () => {
    const scanned = { ...input, code: "mbr-48", exactCode: "mbr-48" };
    expect(cleanGymCardInput(scanned)).toMatchObject({ ok: true, card: { code: "mbr-48" } });
    expect(cleanGymCardInput({ ...scanned, code: "mbr-49" })).toMatchObject({
      ok: true,
      card: { code: "MBR-49" },
    });
    const database = freshDb();
    const card = await addGymCard({ ...scanned, userId: USER }, database);
    expect(card.code).toBe("mbr-48");
    expect(card).not.toHaveProperty("exactCode");
  });

  it("won't bring back a card deleted elsewhere", async () => {
    const database = freshDb();
    const card = await addGymCard({ ...input, userId: USER }, database);
    await deleteGymCard(card, database);
    await expect(updateGymCard(card, { ...input, name: "Back" }, database)).rejects.toBeInstanceOf(
      GymCardGoneError,
    );
    expect((await database.gymCards.get(card.id))?.deletedAt).not.toBeNull();
  });

  it("adds, edits and deletes through the outbox", async () => {
    const database = freshDb();
    const card = await addGymCard({ ...input, userId: USER }, database);
    expect(await database.outbox.count()).toBe(1);
    const second = await addGymCard({ ...input, name: "Northside", userId: USER }, database);
    expect(second.position).toBe(1);

    const edited = await updateGymCard(card, { ...input, code: "MBR-1" }, database);
    expect((await database.gymCards.get(card.id))?.code).toBe("MBR-1");

    await gymCardSvg(edited, database);
    expect(await database.gymCardArt.get(card.id)).toBeDefined();
    await deleteGymCard(edited, database);
    expect((await database.gymCards.get(card.id))?.deletedAt).not.toBeNull();
    expect(await database.gymCardArt.get(card.id)).toBeUndefined();
    expect(await database.outbox.count()).toBe(4);
  });

  it("opens the card for the gym, else the first", () => {
    const cards = [
      { id: "a", gymId: "gym-1" },
      { id: "b", gymId: "gym-2" },
    ] as unknown as Parameters<typeof primaryGymCard>[0];
    expect(primaryGymCard(cards, "gym-2")?.id).toBe("b");
    expect(primaryGymCard(cards, "gym-9")?.id).toBe("a");
    expect(primaryGymCard([], null)).toBeNull();
  });
});

describe("drawing a card's code", () => {
  it("draws every format as black on white SVG", async () => {
    const codes = {
      code128: "MBR-0048213",
      code39: "00048213",
      code93: "00048213",
      codabar: "A40156B",
      itf: "00482137",
      ean13: "4006381333931",
      ean8: "96385074",
      upca: "036000291452",
      upce: "01234565",
      qr: "NSA:7731-0048-2190",
      pdf417: "MEMBER 00048213",
      datamatrix: "00048213",
      aztec: "NSA:7731",
    } as const;
    for (const [format, code] of Object.entries(codes)) {
      const svg = await drawGymCardSvg(format as keyof typeof codes, code);
      expect(svg, format).toMatch(/^<svg /);
      expect(svg, format).toContain('fill="#FFFFFF"');
    }
    // Lowercase Code 39 draws as Code 39 Extended rather than failing.
    expect(await drawGymCardSvg("code39", "mbr-48")).toMatch(/^<svg /);
  });

  it("throws on a code its format can't hold", async () => {
    await expect(drawGymCardSvg("ean13", "abc")).rejects.toThrow();
  });
});
