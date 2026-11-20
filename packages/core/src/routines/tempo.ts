/**
 * Tempo (issue #845): the seconds for the three phases of one rep, in order
 * lowering (eccentric), pause at the bottom (isometric) and lifting
 * (concentric). Written "3-1-1"; only the lift can be X (explosive). Saved
 * on routine and session exercises as the canonical hyphenated string.
 */
export type TempoPhase = number | "X";
export type Tempo = readonly [down: number, pause: number, up: TempoPhase];

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
 * Reads a tempo from "3-1-1" or the compact "31X", in either case. Returns
 * null for anything else, so a bad stored value reads as no tempo: not
 * exactly three phases, seconds outside 0–20, X outside the lift, or every
 * phase 0.
 */
export function parseTempo(text: string | null | undefined): Tempo | null {
  if (text == null) return null;
  const trimmed = text.trim().toUpperCase();
  if (trimmed === "") return null;
  const parts = trimmed.includes("-") ? trimmed.split("-") : [...trimmed];
  if (parts.length !== 3) return null;
  const down = parsePhase(parts[0] ?? "", false);
  const pause = parsePhase(parts[1] ?? "", false);
  const up = parsePhase(parts[2] ?? "", true);
  if (typeof down !== "number" || typeof pause !== "number" || up === null) return null;
  if (down === 0 && pause === 0 && up === 0) return null;
  return [down, pause, up];
}

/** The canonical form: "3-1-1", "2-0-X". */
export function formatTempo(tempo: Tempo): string {
  return tempo.join("-");
}

/** Seconds one rep takes at this tempo; an X lift counts as half a second. */
export function tempoSecondsPerRep(tempo: Tempo): number {
  const [down, pause, up] = tempo;
  return down + pause + (up === "X" ? EXPLOSIVE_SECONDS : up);
}

/**
 * The tempo to save from the editor's three inputs: the canonical string,
 * null when all three are empty, or "invalid" when they don't make a tempo.
 * An empty input counts as 0 once another one is filled.
 */
export function tempoFromInputs(
  down: string,
  pause: string,
  up: string,
): string | null | "invalid" {
  const values = [down, pause, up].map((value) => value.trim());
  if (values.every((value) => value === "")) return null;
  const tempo = parseTempo(values.map((value) => (value === "" ? "0" : value)).join("-"));
  return tempo ? formatTempo(tempo) : "invalid";
}

/**
 * One second of a running tempo (issue #846): the first second of a phase is
 * its cue, said or played; each further second in that phase is a tick.
 */
export type TempoCue = "down" | "pause" | "up" | "tick";
export type TempoCuePhase = Exclude<TempoCue, "tick">;

/**
 * One rep's cues, one per second: 3-1-1 → down, tick, tick, pause, up. A
 * 0-second phase adds nothing and an X lift is a single "up". Loop it for
 * the next rep.
 */
export function tempoCueSchedule(tempo: Tempo): TempoCue[] {
  const cues: TempoCue[] = [];
  const phases: [TempoCuePhase, number][] = [
    ["down", tempo[0]],
    ["pause", tempo[1]],
    ["up", tempo[2] === "X" ? 1 : tempo[2]],
  ];
  for (const [phase, seconds] of phases) {
    for (let second = 0; second < seconds; second++) cues.push(second === 0 ? phase : "tick");
  }
  return cues;
}

/** The phase a running tempo is in, `elapsedSeconds` whole seconds after it started. */
export function tempoPhaseAt(tempo: Tempo, elapsedSeconds: number): TempoCuePhase {
  const cues = tempoCueSchedule(tempo);
  const second = ((Math.floor(elapsedSeconds) % cues.length) + cues.length) % cues.length;
  for (let index = second; index >= 0; index--) {
    const cue = cues[index];
    if (cue && cue !== "tick") return cue;
  }
  return "down";
}
