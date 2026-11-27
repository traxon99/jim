import { GYM_CARD_FORMAT_LABELS, type GymCardFormat } from "@jim/core";
import { type DbOrTx, gymCards, gyms } from "@jim/db";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser, withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";

/**
 * Gym cards (issue #878, ADR-026): the membership cards the user keeps in the
 * app to show at the gym door. Claude can see which cards there are and delete
 * one, but never the code: a door credential has no business in a chat, so
 * every query here names its columns and none of them is `code`.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The columns Claude may see. Never `code`. */
const CARD_COLUMNS = {
  id: gymCards.id,
  name: gymCards.name,
  format: gymCards.format,
  color: gymCards.color,
  gymId: gymCards.gymId,
  position: gymCards.position,
  createdAt: gymCards.createdAt,
};

type CardSummary = {
  id: string;
  name: string;
  format: string;
  color: string;
  gymId: string | null;
  position: number;
  createdAt: Date;
};

async function liveCards(tx: DbOrTx): Promise<CardSummary[]> {
  return tx
    .select(CARD_COLUMNS)
    .from(gymCards)
    .where(isNull(gymCards.deletedAt))
    .orderBy(asc(gymCards.position), asc(gymCards.createdAt));
}

async function findCard(tx: DbOrTx, key: string): Promise<CardSummary> {
  const trimmed = key.trim();
  const all = await liveCards(tx);
  const candidates = UUID_RE.test(trimmed)
    ? all.filter((card) => card.id === trimmed)
    : all.filter((card) => card.name.toLowerCase() === trimmed.toLowerCase());
  const [card, ...others] = candidates;
  if (!card) throw new Error(`No gym card matches "${key}". Try list_gym_cards.`);
  if (others.length > 0) {
    throw new Error(
      `${candidates.length} gym cards are named "${key}" (${candidates.map((c) => c.id).join(", ")}). Pass one of those ids instead.`,
    );
  }
  return card;
}

/** The user's gym cards in their order, with the gym each is for. Never the code. */
export async function listGymCards(context: UserContext) {
  return withUser(context, async (tx) => {
    const cards = await liveCards(tx);
    const gymNames = new Map(
      (
        await tx.select({ id: gyms.id, name: gyms.name }).from(gyms).where(isNull(gyms.deletedAt))
      ).map((gym) => [gym.id, gym.name]),
    );
    return cards.map((card) => ({
      id: card.id,
      name: card.name,
      format: GYM_CARD_FORMAT_LABELS[card.format as GymCardFormat] ?? card.format,
      color: card.color,
      gym: card.gymId ? (gymNames.get(card.gymId) ?? null) : null,
    }));
  });
}

/** Deletes a gym card, as its Delete on the phone does. */
export async function deleteGymCard(
  context: UserContext,
  input: { card: string; dryRun?: boolean },
) {
  return withUserWrite(context, input.dryRun ?? true, async (tx) => {
    const card = await findCard(tx, input.card);
    const now = new Date();
    await tx
      .update(gymCards)
      .set({
        deletedAt: now,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(and(eq(gymCards.id, card.id), isNull(gymCards.deletedAt)));
    return { deleted: card.name };
  });
}
