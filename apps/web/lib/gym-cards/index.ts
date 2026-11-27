import { mutate } from "@/lib/db/mutate";
import { type GymCardRow, type JimDatabase, db } from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/engine";
import {
  GYM_CARD_COLORS,
  GYM_CARD_NAME_MAX,
  type GymCardFormat,
  cleanGymCardCode,
  gymCardCodeError,
  isHexColor,
  sortGymCards,
  uuidv7,
} from "@jim/core";

/**
 * Gym cards (issue #878): the membership card or key tag a gym scans at the
 * door, written through the outbox like gyms, so the list works offline and
 * syncs. The server seals each code (ADR-026); on the phone it's plain.
 */

export interface GymCardInput {
  name: string;
  format: GymCardFormat;
  code: string;
  color: string;
  gymId: string | null;
}

export type CleanedGymCard = { ok: true; card: GymCardInput } | { ok: false; error: string };

export function cleanGymCardInput(input: GymCardInput): CleanedGymCard {
  const name = input.name.trim().slice(0, GYM_CARD_NAME_MAX);
  if (!name) return { ok: false, error: "Give the card a name" };
  const code = cleanGymCardCode(input.format, input.code);
  const error = gymCardCodeError(input.format, code);
  if (error) return { ok: false, error };
  const color = isHexColor(input.color) ? input.color.toLowerCase() : GYM_CARD_COLORS[0];
  return { ok: true, card: { name, format: input.format, code, color, gymId: input.gymId } };
}

export async function addGymCard(
  input: GymCardInput & { userId: string },
  database: JimDatabase = db,
): Promise<GymCardRow> {
  const cleaned = cleanGymCardInput(input);
  if (!cleaned.ok) throw new Error(cleaned.error);
  const live = sortGymCards(await database.gymCards.toArray());
  const now = new Date();
  const entity: GymCardRow = {
    id: uuidv7(),
    userId: input.userId,
    ...cleaned.card,
    position: live.reduce((max, row) => Math.max(max, row.position + 1), 0),
    createdAt: now,
    updatedAt: now,
    deviceId: await getDeviceId(database),
    deletedAt: null,
    serverSeq: 0,
  };
  await mutate("gymCards", entity, database);
  return entity;
}

export async function updateGymCard(
  row: GymCardRow,
  input: GymCardInput,
  database: JimDatabase = db,
): Promise<GymCardRow> {
  const cleaned = cleanGymCardInput(input);
  if (!cleaned.ok) throw new Error(cleaned.error);
  const entity: GymCardRow = {
    ...row,
    ...cleaned.card,
    updatedAt: new Date(),
    deviceId: await getDeviceId(database),
  };
  await mutate("gymCards", entity, database);
  return entity;
}

/** Tombstones a card and drops its drawing from this phone. */
export async function deleteGymCard(row: GymCardRow, database: JimDatabase = db): Promise<void> {
  const now = new Date();
  await mutate(
    "gymCards",
    { ...row, deletedAt: now, updatedAt: now, deviceId: await getDeviceId(database) },
    database,
  );
  await database.gymCardArt.delete(row.id);
}

/**
 * The card to open from Lift: the one for `gymId` (the gym today's workout is
 * at, else the home gym), else the first card.
 */
export function primaryGymCard(
  cards: readonly GymCardRow[],
  gymId: string | null,
): GymCardRow | null {
  return cards.find((card) => gymId && card.gymId === gymId) ?? cards[0] ?? null;
}
