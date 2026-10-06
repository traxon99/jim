import { programWeekProgress, uuidv7 } from "@jim/core";
import { type DbOrTx, programRoutines, programs, routines } from "@jim/db";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { UserContext } from "../context.js";
import { withUser, withUserWrite } from "../context.js";
import { MCP_DEVICE_ID } from "./create-routine.js";
import { findRoutine } from "./find-routine.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type ProgramRow = typeof programs.$inferSelect;

export interface ProgramEntryInput {
  /** Routine id or name; omit or null for a rest day. */
  routine?: string | null;
  /** 0 = Sunday .. 6 = Saturday. Required in weekly mode, ignored in a sequence. */
  weekday?: number;
}

async function findProgram(tx: DbOrTx, key: string): Promise<ProgramRow> {
  const live = isNull(programs.deletedAt);
  const trimmed = key.trim();
  let candidates = UUID_RE.test(trimmed)
    ? await tx
        .select()
        .from(programs)
        .where(and(live, eq(programs.id, trimmed)))
    : [];
  if (candidates.length === 0) {
    const all = await tx.select().from(programs).where(live);
    candidates = all.filter((program) => program.name.toLowerCase() === trimmed.toLowerCase());
  }
  const [program, ...others] = candidates;
  if (!program) {
    throw new Error(`No program matches "${key}". Try list_programs to see what exists.`);
  }
  if (others.length > 0) {
    throw new Error(
      `${candidates.length} programs are named "${key}" (${candidates.map((p) => p.id).join(", ")}). Pass one of those ids instead.`,
    );
  }
  return program;
}

function describeEntries(
  rows: (typeof programRoutines.$inferSelect)[],
  mode: ProgramRow["mode"],
  nameById: Map<string, string>,
) {
  return rows.map((row) => ({
    routineId: row.routineId,
    routineName: row.routineId ? (nameById.get(row.routineId) ?? null) : null,
    restDay: row.routineId === null,
    ...(mode === "weekly" && row.weekday != null
      ? { weekday: row.weekday, weekdayName: WEEKDAYS[row.weekday] }
      : {}),
  }));
}

/**
 * Every program (a rotating sequence or a weekly schedule) with its
 * entries in order, rest days included, and "week N of M" for one with a
 * planned length.
 */
export async function listPrograms(context: UserContext) {
  return withUser(context, async (tx) => {
    const rows = await tx
      .select()
      .from(programs)
      .where(isNull(programs.deletedAt))
      .orderBy(asc(programs.position), asc(programs.name));
    if (rows.length === 0) return [];

    const entries = await tx
      .select()
      .from(programRoutines)
      .where(
        and(
          inArray(
            programRoutines.programId,
            rows.map((row) => row.id),
          ),
          isNull(programRoutines.deletedAt),
        ),
      )
      .orderBy(asc(programRoutines.position));
    const liveRoutines = await tx
      .select({ id: routines.id, name: routines.name })
      .from(routines)
      .where(isNull(routines.deletedAt));
    const nameById = new Map(liveRoutines.map((routine) => [routine.id, routine.name]));
    const now = new Date();

    return rows.map((program) => {
      // Entries whose routine has since been deleted are left out.
      const own = entries.filter(
        (entry) =>
          entry.programId === program.id &&
          (entry.routineId === null || nameById.has(entry.routineId)),
      );
      return {
        id: program.id,
        name: program.name,
        mode: program.mode,
        isActive: program.isActive,
        notes: program.notes,
        durationWeeks: program.durationWeeks,
        progress: programWeekProgress(program, now),
        entries: describeEntries(own, program.mode, nameById),
      };
    });
  });
}

async function writeEntries(
  tx: DbOrTx,
  userId: string,
  programId: string,
  mode: ProgramRow["mode"],
  entries: ProgramEntryInput[],
  now: Date,
) {
  const written = [];
  for (const [position, entry] of entries.entries()) {
    if (mode === "weekly" && (entry.weekday == null || entry.weekday < 0 || entry.weekday > 6)) {
      throw new Error("Every entry in a weekly program needs a weekday from 0 (Sunday) to 6.");
    }
    const routine = entry.routine ? await findRoutine(tx, entry.routine) : null;
    if (routine?.kind === "warmup") {
      throw new Error(
        `"${routine.name}" is a warm-up. Link it to a routine with update_routine's warmup instead.`,
      );
    }
    await tx.insert(programRoutines).values({
      id: uuidv7(),
      userId,
      programId,
      routineId: routine?.id ?? null,
      position,
      weekday: mode === "weekly" ? (entry.weekday ?? null) : null,
      updatedAt: now,
      deviceId: MCP_DEVICE_ID,
    });
    written.push({
      routineId: routine?.id ?? null,
      routineName: routine?.name ?? null,
      restDay: routine === null,
      ...(mode === "weekly" && entry.weekday != null
        ? { weekday: entry.weekday, weekdayName: WEEKDAYS[entry.weekday] }
        : {}),
    });
  }
  return written;
}

/** Makes `programId` the only active program, as the phone's setActiveProgram does. */
async function activate(tx: DbOrTx, programId: string, now: Date) {
  await tx
    .update(programs)
    .set({
      isActive: false,
      updatedAt: now,
      deviceId: MCP_DEVICE_ID,
      serverSeq: sql`nextval('sync_seq')`,
    })
    .where(
      and(eq(programs.isActive, true), ne(programs.id, programId), isNull(programs.deletedAt)),
    );
}

export interface CreateProgramInput {
  name: string;
  mode?: "sequence" | "weekly";
  notes?: string;
  durationWeeks?: number;
  entries: ProgramEntryInput[];
  /** Make it the active program (any other active one is switched off). */
  activate?: boolean;
  dryRun?: boolean;
}

export async function createProgram(context: UserContext, input: CreateProgramInput) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const now = new Date();
    const id = uuidv7();
    const mode = input.mode ?? "sequence";
    const existing = await tx.select({ position: programs.position }).from(programs);
    await tx.insert(programs).values({
      id,
      userId: context.userId,
      name: input.name,
      mode,
      notes: input.notes ?? null,
      durationWeeks: input.durationWeeks ?? null,
      isActive: input.activate ?? false,
      activatedAt: input.activate ? now : null,
      position: existing.length === 0 ? 0 : Math.max(...existing.map((p) => p.position)) + 1,
      updatedAt: now,
      deviceId: MCP_DEVICE_ID,
    });
    if (input.activate) await activate(tx, id, now);
    const entries = await writeEntries(tx, context.userId, id, mode, input.entries, now);
    return { id, name: input.name, mode, isActive: input.activate ?? false, entries };
  });
}

export interface UpdateProgramInput {
  program: string;
  name?: string;
  mode?: "sequence" | "weekly";
  notes?: string | null;
  durationWeeks?: number | null;
  /** When given, replaces the whole entry list. */
  entries?: ProgramEntryInput[];
  /** true makes it the active program; false deactivates it. */
  active?: boolean;
  dryRun?: boolean;
}

export async function updateProgram(context: UserContext, input: UpdateProgramInput) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const program = await findProgram(tx, input.program);
    const now = new Date();
    const mode = input.mode ?? program.mode;
    if (input.mode && input.mode !== program.mode && !input.entries) {
      throw new Error(
        "Switching between sequence and weekly changes what each entry means, so pass the new entries too.",
      );
    }
    const becomingActive = input.active === true && !program.isActive;

    await tx
      .update(programs)
      .set({
        name: input.name ?? program.name,
        mode,
        notes: input.notes === undefined ? program.notes : input.notes,
        durationWeeks:
          input.durationWeeks === undefined ? program.durationWeeks : input.durationWeeks,
        isActive: input.active ?? program.isActive,
        activatedAt: becomingActive ? now : program.activatedAt,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(eq(programs.id, program.id));
    if (input.active) await activate(tx, program.id, now);

    let entries: Awaited<ReturnType<typeof writeEntries>> | undefined;
    if (input.entries) {
      await tx
        .update(programRoutines)
        .set({
          deletedAt: now,
          updatedAt: now,
          deviceId: MCP_DEVICE_ID,
          serverSeq: sql`nextval('sync_seq')`,
        })
        .where(and(eq(programRoutines.programId, program.id), isNull(programRoutines.deletedAt)));
      entries = await writeEntries(tx, context.userId, program.id, mode, input.entries, now);
    }

    return {
      id: program.id,
      name: input.name ?? program.name,
      mode,
      isActive: input.active ?? program.isActive,
      entries,
    };
  });
}

export async function deleteProgram(
  context: UserContext,
  input: { program: string; dryRun?: boolean },
) {
  return withUserWrite(context, input.dryRun ?? false, async (tx) => {
    const program = await findProgram(tx, input.program);
    const now = new Date();
    await tx
      .update(programs)
      .set({
        isActive: false,
        deletedAt: now,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(eq(programs.id, program.id));
    await tx
      .update(programRoutines)
      .set({
        deletedAt: now,
        updatedAt: now,
        deviceId: MCP_DEVICE_ID,
        serverSeq: sql`nextval('sync_seq')`,
      })
      .where(and(eq(programRoutines.programId, program.id), isNull(programRoutines.deletedAt)));
    return { id: program.id, name: program.name, deleted: true };
  });
}
