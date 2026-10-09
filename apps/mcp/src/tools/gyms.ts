import { uuidv7 } from "@jim/core";
import { type DbOrTx, gyms } from "@jim/db";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser, withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same limits as the phone's Gyms screen (apps/web/lib/gyms).
const NAME_MAX = 80;
const ADDRESS_MAX = 200;
const NOTES_MAX = 500;

type GymRow = typeof gyms.$inferSelect;

function cleanText(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed.slice(0, max);
}

function cleanName(value: string): string {
  const name = cleanText(value, NAME_MAX);
  if (!name) throw new Error("A gym needs a name.");
  return name;
}

function describe(row: GymRow) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    notes: row.notes,
    isHome: row.isDefault,
  };
}

async function liveGyms(tx: DbOrTx): Promise<GymRow[]> {
  return tx
    .select()
    .from(gyms)
    .where(isNull(gyms.deletedAt))
    .orderBy(asc(gyms.position), asc(gyms.createdAt));
}

export async function findGym(tx: DbOrTx, key: string): Promise<GymRow> {
  const trimmed = key.trim();
  const all = await liveGyms(tx);
  const candidates = UUID_RE.test(trimmed)
    ? all.filter((gym) => gym.id === trimmed)
    : all.filter((gym) => gym.name.toLowerCase() === trimmed.toLowerCase());
  const [gym, ...others] = candidates;
  if (!gym) throw new Error(`No gym matches "${key}". Try list_gyms to see what exists.`);
  if (others.length > 0) {
    throw new Error(
      `${candidates.length} gyms are named "${key}" (${candidates.map((g) => g.id).join(", ")}). Pass one of those ids instead.`,
    );
  }
  return gym;
}

/** Clears the home flag on every live gym except `id`, the way the phone's star does. */
async function clearOtherHomes(tx: DbOrTx, id: string, now: Date) {
  await tx
    .update(gyms)
    .set({
      isDefault: false,
      updatedAt: now,
      deviceId: MCP_DEVICE_ID,
      serverSeq: sql`nextval('sync_seq')`,
    })
    .where(and(isNull(gyms.deletedAt), eq(gyms.isDefault, true), ne(gyms.id, id)));
}

/** Every gym the user trains at (issue #451), home gym first. */
export async function listGyms(context: UserContext) {
  return withUser(context, async (tx) => {
    const rows = await liveGyms(tx);
    return rows
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
      .map((row) => describe(row));
  });
}

export interface CreateGymInput {
  name: string;
  address?: string;
  notes?: string;
  /** Make it the home gym. The first gym is always home. */
  makeHome?: boolean;
  dryRun?: boolean;
}

export async function createGym(context: UserContext, input: CreateGymInput) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const name = cleanName(input.name);
    const existing = await liveGyms(tx);
    const isDefault = existing.length === 0 || (input.makeHome ?? false);
    const now = new Date();
    const id = uuidv7();
    if (isDefault) await clearOtherHomes(tx, id, now);
    const [row] = await tx
      .insert(gyms)
      .values({
        id,
        userId: context.userId,
        name,
        address: cleanText(input.address, ADDRESS_MAX),
        notes: cleanText(input.notes, NOTES_MAX),
        isDefault,
        position: existing.reduce((max, gym) => Math.max(max, gym.position + 1), 0),
        createdAt: now,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
      })
      .returning();
    if (!row) throw new Error("Couldn't create the gym.");
    return describe(row);
  });
}

export interface UpdateGymInput {
  gym: string;
  name?: string;
  /** Empty string clears it. */
  address?: string;
  /** Empty string clears it. */
  notes?: string;
  /** true makes it the home gym. */
  makeHome?: boolean;
  dryRun?: boolean;
}

export async function updateGym(context: UserContext, input: UpdateGymInput) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const gym = await findGym(tx, input.gym);
    const now = new Date();
    const makeHome = input.makeHome === true && !gym.isDefault;
    if (makeHome) await clearOtherHomes(tx, gym.id, now);
    const [row] = await tx
      .update(gyms)
      .set({
        ...(input.name !== undefined ? { name: cleanName(input.name) } : {}),
        ...(input.address !== undefined ? { address: cleanText(input.address, ADDRESS_MAX) } : {}),
        ...(input.notes !== undefined ? { notes: cleanText(input.notes, NOTES_MAX) } : {}),
        ...(makeHome ? { isDefault: true } : {}),
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(eq(gyms.id, gym.id))
      .returning();
    if (!row) throw new Error("Couldn't update the gym.");
    return describe(row);
  });
}

/** Deletes a gym; if it was home, the next gym takes over, as on the phone. */
export async function deleteGym(context: UserContext, input: { gym: string; dryRun?: boolean }) {
  return withUserWrite(context, input.dryRun ?? true, async (tx) => {
    const gym = await findGym(tx, input.gym);
    const now = new Date();
    await tx
      .update(gyms)
      .set({
        isDefault: false,
        deletedAt: now,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(eq(gyms.id, gym.id));
    let newHome: string | null = null;
    if (gym.isDefault) {
      const [next] = await liveGyms(tx);
      if (next) {
        await tx
          .update(gyms)
          .set({
            isDefault: true,
            updatedAt: now,
            deviceId: MCP_DEVICE_ID,
            serverSeq: sql`nextval('sync_seq')`,
          })
          .where(eq(gyms.id, next.id));
        newHome = next.name;
      }
    }
    return { id: gym.id, name: gym.name, deleted: true, newHome };
  });
}
