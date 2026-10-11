import { mutate } from "@/lib/db/mutate";
import { type GymRow, type JimDatabase, db } from "@/lib/db/schema";
import { getDeviceId } from "@/lib/sync/engine";
import { gymCoordinates, uuidv7 } from "@jim/core";

/**
 * Gyms (issue #451): the places a user trains. Each is a `gyms` row written
 * through the outbox, so the list works offline and syncs. One live gym is
 * the home gym (`isDefault`); the first gym added becomes it, and deleting
 * it hands the role to the next one. This is the base that equipment
 * details (issue #450) attach to. An address can be pinned to a real place
 * (issue #462): picking a place stores its coordinates, which the Analysis
 * map uses.
 */

export const GYM_NAME_MAX = 80;
export const GYM_ADDRESS_MAX = 200;
export const GYM_NOTES_MAX = 500;

export interface GymInput {
  name: string;
  address?: string | null;
  /** Where the address resolved to; only kept when both are valid and there's an address. */
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
}

/** Live gyms, home gym first, then in the order they were added. */
export function sortGyms(rows: readonly GymRow[]): GymRow[] {
  return rows
    .filter((row) => !row.deletedAt)
    .sort(
      (a, b) =>
        Number(b.isDefault) - Number(a.isDefault) ||
        a.position - b.position ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
}

function cleanText(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed.slice(0, max);
}

/** Trims and validates a gym's fields; returns an error message, or the cleaned fields. */
export function cleanGymInput(input: GymInput):
  | {
      ok: true;
      name: string;
      address: string | null;
      latitude: number | null;
      longitude: number | null;
      notes: string | null;
    }
  | { ok: false; error: string } {
  const name = cleanText(input.name, GYM_NAME_MAX);
  if (!name) return { ok: false, error: "Give your gym a name" };
  const address = cleanText(input.address, GYM_ADDRESS_MAX);
  const coordinates = address ? gymCoordinates(input) : null;
  return {
    ok: true,
    name,
    address,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    notes: cleanText(input.notes, GYM_NOTES_MAX),
  };
}

export async function addGym(
  input: GymInput & { userId: string },
  database: JimDatabase = db,
): Promise<GymRow> {
  const cleaned = cleanGymInput(input);
  if (!cleaned.ok) throw new Error(cleaned.error);
  const live = sortGyms(await database.gyms.toArray());
  const now = new Date();
  const entity: GymRow = {
    id: uuidv7(),
    userId: input.userId,
    name: cleaned.name,
    address: cleaned.address,
    latitude: cleaned.latitude,
    longitude: cleaned.longitude,
    notes: cleaned.notes,
    isDefault: live.length === 0,
    position: live.reduce((max, row) => Math.max(max, row.position + 1), 0),
    createdAt: now,
    updatedAt: now,
    deviceId: await getDeviceId(database),
    deletedAt: null,
    serverSeq: 0,
  };
  await mutate("gyms", entity, database);
  return entity;
}

export async function updateGym(
  row: GymRow,
  input: GymInput,
  database: JimDatabase = db,
): Promise<GymRow> {
  const cleaned = cleanGymInput(input);
  if (!cleaned.ok) throw new Error(cleaned.error);
  const entity: GymRow = {
    ...row,
    name: cleaned.name,
    address: cleaned.address,
    latitude: cleaned.latitude,
    longitude: cleaned.longitude,
    notes: cleaned.notes,
    updatedAt: new Date(),
    deviceId: await getDeviceId(database),
  };
  await mutate("gyms", entity, database);
  return entity;
}

/** Makes `id` the home gym and clears the flag on every other live gym. */
export async function setDefaultGym(id: string, database: JimDatabase = db): Promise<void> {
  const live = sortGyms(await database.gyms.toArray());
  if (!live.some((row) => row.id === id)) return;
  const deviceId = await getDeviceId(database);
  const now = new Date();
  for (const row of live) {
    const isDefault = row.id === id;
    if (row.isDefault === isDefault) continue;
    await mutate("gyms", { ...row, isDefault, updatedAt: now, deviceId }, database);
  }
}

/** Tombstones a gym; if it was the home gym, the next one takes over. */
export async function deleteGym(row: GymRow, database: JimDatabase = db): Promise<void> {
  const deviceId = await getDeviceId(database);
  const now = new Date();
  await mutate(
    "gyms",
    { ...row, isDefault: false, deletedAt: now, updatedAt: now, deviceId },
    database,
  );
  if (!row.isDefault) return;
  const next = sortGyms(await database.gyms.toArray())[0];
  if (next) await mutate("gyms", { ...next, isDefault: true, updatedAt: now, deviceId }, database);
}
