/**
 * Tempo (issue #845): the seconds for the phases of one rep, in order
 * lowering (eccentric), pause at the bottom (isometric), lifting (concentric)
 * and, optionally, the time between reps before the next one starts (issue
 * #867). Written "3-1-1" or "3-1-1-2"; only the lift can be X (explosive).
 * Saved on routine and session exercises as the canonical hyphenated string,
 * which leaves a 0 between off so older tempos read the same.
 */
export type TempoPhase = number | "X";
export type Tempo =
  | readonly [down: number, pause: number, up: TempoPhase]
  | readonly [down: number, pause: number, up: TempoPhase, between: number];

/** The longest a single phase can be, in seconds; room for slow eccentrics. */
export const MAX_TEMPO_PHASE_SECONDS = 20;

/** What an X lift counts as when adding up time per rep. */
const EXPLOSIVE_SECONDS = 0.5;

function parsePhase(text: string, allowExplosive: boolean): TempoPhase | null {
  if (allowExplosive && text === "X") return "X";
  if (!/^\d{1,2}$/.test(text)) return null;
  const seconds = Number(text);
  return seconds <= MAX_TEMPO_PHASE_SECONDS ? seconds : null;
}

/**
 * Reads a tempo from "3-1-1" / "3-1-1-2" or the compact "31X" / "31X2", in
 * either case. Returns null for anything else, so a bad stored value reads as
 * no tempo: not three or four phases, seconds outside 0–20, X outside the
 * lift, or down, pause and up all 0. A 0 between is dropped: [3, 1, 1].
 */
export function parseTempo(text: string | null | undefined): Tempo | null {
  if (text == null) return null;
  const trimmed = text.trim().toUpperCase();
  if (trimmed === "") return null;
  const parts = trimmed.includes("-") ? trimmed.split("-") : [...trimmed];
  if (parts.length !== 3 && parts.length !== 4) return null;
  const down = parsePhase(parts[0] ?? "", false);
  const pause = parsePhase(parts[1] ?? "", false);
  const up = parsePhase(parts[2] ?? "", true);
  const between = parts.length === 4 ? parsePhase(parts[3] ?? "", false) : 0;
  if (typeof down !== "number" || typeof pause !== "number" || up === null) return null;
  if (typeof between !== "number") return null;
  if (down === 0 && pause === 0 && up === 0) return null;
  return between > 0 ? [down, pause, up, between] : [down, pause, up];
}

/** Seconds between reps (issue #867); 0 when the tempo has none. */
export function tempoBetweenSeconds(tempo: Tempo): number {
  return tempo[3] ?? 0;
}

/** The canonical form: "3-1-1", "2-0-X", "3-1-1-2"; a 0 between is left off. */
export function formatTempo(tempo: Tempo): string {
  const [down, pause, up] = tempo;
  const between = tempoBetweenSeconds(tempo);
  return (between > 0 ? [down, pause, up, between] : [down, pause, up]).join("-");
}

/**
 * Seconds one rep takes at this tempo, the time before the next rep
 * included; an X lift counts as half a second.
 */
export function tempoSecondsPerRep(tempo: Tempo): number {
  const [down, pause, up] = tempo;
  return down + pause + (up === "X" ? EXPLOSIVE_SECONDS : up) + tempoBetweenSeconds(tempo);
}

/**
 * The tempo to save from the editor's inputs (Down, Pause, Up and, from
 * issue #867, Between): the canonical string, null when all are empty, or
 * "invalid" when they don't make a tempo. An empty input counts as 0 once
 * another one is filled.
 */
export function tempoFromInputs(
  down: string,
  pause: string,
  up: string,
  between = "",
): string | null | "invalid" {
  const values = [down, pause, up, between].map((value) => value.trim());
  if (values.every((value) => value === "")) return null;
  const tempo = parseTempo(values.map((value) => (value === "" ? "0" : value)).join("-"));
  return tempo ? formatTempo(tempo) : "invalid";
}

/**
 * One second of a running tempo (issue #846): the first second of a phase is
 * its cue, said or played; each further second in that phase is a tick.
 * "between" is the time before the next rep (issue #867).
 */
export type TempoCue = "down" | "pause" | "up" | "between" | "tick";
export type TempoCuePhase = Exclude<TempoCue, "tick">;

/**
 * One rep's cues, one per second: 3-1-1-2 → down, tick, tick, pause, up,
 * between, tick. A 0-second phase adds nothing and an X lift is a single
 * "up". Loop it for the next rep.
 */
export function tempoCueSchedule(tempo: Tempo): TempoCue[] {
  const cues: TempoCue[] = [];
  const phases: [TempoCuePhase, number][] = [
    ["down", tempo[0]],
    ["pause", tempo[1]],
    ["up", tempo[2] === "X" ? 1 : tempo[2]],
    ["between", tempoBetweenSeconds(tempo)],
  ];
  for (const [phase, seconds] of phases) {
    for (let second = 0; second < seconds; second++) cues.push(second === 0 ? phase : "tick");
  }
  return cues;
}

/**
 * A whole set's cues (issue #867): `reps` reps of `tempoCueSchedule`, with
 * no time between after the last one, so the cues end with that rep's lift.
 * Null `reps` (nothing in the reps box) means no end: loop one rep's cues.
 */
export function tempoSetCues(tempo: Tempo, reps: number | null): TempoCue[] | null {
  if (reps === null) return null;
  const rep = tempoCueSchedule(tempo);
  const count = Math.max(1, Math.floor(reps));
  const cues = Array.from({ length: count }, () => rep).flat();
  return cues.slice(0, cues.length - tempoBetweenSeconds(tempo));
}

/**
 * The rep a running tempo has just finished at `beat` (whole seconds after
 * it started), or null: the beat right after a rep's lift, which is the
 * first second between reps or the next rep's first. The optional rep count
 * (issue #867) says this number. With `reps`, nothing past the last one.
 */
export function tempoRepFinishedAt(
  tempo: Tempo,
  beat: number,
  reps: number | null = null,
): number | null {
  const perRep = tempoCueSchedule(tempo).length;
  const sinceFirst = beat - (perRep - tempoBetweenSeconds(tempo));
  if (sinceFirst < 0 || sinceFirst % perRep !== 0) return null;
  const rep = sinceFirst / perRep + 1;
  return reps !== null && rep > Math.max(1, Math.floor(reps)) ? null : rep;
}

/**
 * The phase and rep (from 1) a running tempo is in, `elapsedSeconds` whole
 * seconds after it started. With `reps`, null once those reps are done.
 */
export function tempoPositionAt(
  tempo: Tempo,
  elapsedSeconds: number,
  reps: number | null = null,
): { phase: TempoCuePhase; rep: number } | null {
  const cues = tempoCueSchedule(tempo);
  const elapsed = Math.max(0, Math.floor(elapsedSeconds));
  const set = tempoSetCues(tempo, reps);
  if (set && elapsed >= set.length) return null;
  const rep = Math.floor(elapsed / cues.length) + 1;
  const second = elapsed % cues.length;
  for (let index = second; index >= 0; index--) {
    const cue = cues[index];
    if (cue && cue !== "tick") return { phase: cue, rep };
  }
  return { phase: "down", rep };
}

/** The phase a running tempo is in, `elapsedSeconds` whole seconds after it started. */
export function tempoPhaseAt(tempo: Tempo, elapsedSeconds: number): TempoCuePhase {
  return tempoPositionAt(tempo, elapsedSeconds)?.phase ?? "down";
}

/**
 * What a list of lifts' tempos add up to (issue #850), for a routine's or
 * program's Tempo row and the All lifts inputs: "none" when no lift has one,
 * "same" when every lift has the same one, "mixed" otherwise (including only
 * some lifts set). Values that aren't a tempo count as none.
 */
export type SharedTempo = { kind: "none" } | { kind: "same"; tempo: string } | { kind: "mixed" };

export function sharedTempo(tempos: readonly (string | null | undefined)[]): SharedTempo {
  const canonical = tempos.map((value) => {
    const tempo = parseTempo(value);
    return tempo ? formatTempo(tempo) : null;
  });
  if (canonical.every((tempo) => tempo === null)) return { kind: "none" };
  const [first] = canonical;
  if (first != null && canonical.every((tempo) => tempo === first)) {
    return { kind: "same", tempo: first };
  }
  return { kind: "mixed" };
}
