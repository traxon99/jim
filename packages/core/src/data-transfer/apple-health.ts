import type { ImportedWeight, ParsedWeightCsv } from "./weight-csv";
import { type WeightUnit, WorkoutCsvError } from "./workout-csv";

/**
 * Bodyweight in from Apple Health (issue #247). A PWA can't read HealthKit
 * (ADR-009), so this reads the `export.xml` the Health app exports. That
 * file can run to hundreds of MB, so it's never held whole: the caller
 * feeds it in chunks and only the `HKQuantityTypeIdentifierBodyMass`
 * records are kept, one per local day (the last weigh-in of the day, so a
 * smart scale's several readings don't each become a point).
 */

const NEEDLE = 'type="HKQuantityTypeIdentifierBodyMass"';
/** How much text before a match is kept, so a `<Record` split across chunks is still found. */
const TAIL = 4096;
/** Plausible bodyweights, after converting to kg or lb; anything outside is junk. */
const MIN_WEIGHT = 20;
const MAX_WEIGHT = 1000;

/** "2024-01-05 07:12:33 -0500", Health's date format, to an instant. */
export function parseHealthDate(raw: string): Date | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\s*(?:([+-])(\d{2}):?(\d{2})|Z)?$/.exec(
      raw.trim(),
    );
  if (!match) return null;
  const [, y, mo, d, h, mi, s, sign, oh, om] = match;
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  const offset = sign ? (sign === "-" ? -1 : 1) * (Number(oh) * 60 + Number(om)) * 60_000 : 0;
  const date = new Date(utc - offset);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Health's mass units to kg or lb. Stone and grams are rare but valid in an export. */
function toWeight(value: number, unit: string): { value: number; unit: WeightUnit } | null {
  switch (unit.trim().toLowerCase()) {
    case "kg":
      return { value, unit: "kg" };
    case "lb":
    case "lbs":
      return { value, unit: "lb" };
    case "g":
      return { value: value / 1000, unit: "kg" };
    case "st":
      return { value: value * 14, unit: "lb" };
    default:
      return null;
  }
}

/** The index of the `>` closing a tag that starts at `from`, skipping `>` inside quotes. */
function tagEnd(text: string, from: number): number {
  let quote: string | null = null;
  for (let i = from; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return i;
    }
  }
  return -1;
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return match ? (match[1] ?? match[2] ?? null) : null;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Feed `export.xml` in with `push`, then call `finish`. Chunks can split
 * anywhere, mid-tag included.
 */
export class AppleHealthWeightScanner {
  private buffer = "";
  private sawHealthData = false;
  private readonly byDay = new Map<string, ImportedWeight>();
  private skippedRows = 0;
  private sameDayRows = 0;

  push(chunk: string): void {
    this.buffer += chunk;
    if (!this.sawHealthData && this.buffer.includes("<HealthData")) this.sawHealthData = true;

    let pos = 0;
    for (;;) {
      const at = this.buffer.indexOf(NEEDLE, pos);
      if (at === -1) {
        // Keep enough to catch a needle (or the start of its tag) split by the chunk.
        this.buffer = this.buffer.slice(Math.max(pos, this.buffer.length - TAIL));
        return;
      }
      const start = this.buffer.lastIndexOf("<", at);
      const end = tagEnd(this.buffer, at + NEEDLE.length);
      if (end === -1) {
        this.buffer = this.buffer.slice(start === -1 || start < pos ? at : start);
        return;
      }
      this.record(this.buffer.slice(start === -1 || start < pos ? at : start, end + 1));
      pos = end + 1;
    }
  }

  private record(tag: string): void {
    const measuredAt = parseHealthDate(attribute(tag, "startDate") ?? "");
    const raw = Number(attribute(tag, "value"));
    const weight =
      Number.isFinite(raw) && raw > 0 ? toWeight(raw, attribute(tag, "unit") ?? "") : null;
    if (!measuredAt || !weight || weight.value < MIN_WEIGHT || weight.value > MAX_WEIGHT) {
      this.skippedRows++;
      return;
    }
    const day = dayKey(measuredAt);
    const earlier = this.byDay.get(day);
    if (earlier) {
      this.sameDayRows++;
      if (earlier.measuredAt.getTime() > measuredAt.getTime()) return;
    }
    this.byDay.set(day, { measuredAt, value: weight.value, unit: weight.unit });
  }

  finish(): ParsedWeightCsv {
    this.buffer = "";
    const entries = [...this.byDay.values()].sort(
      (a, b) => a.measuredAt.getTime() - b.measuredAt.getTime(),
    );
    if (entries.length === 0) {
      throw new WorkoutCsvError(
        this.sawHealthData
          ? "That Health export has no bodyweight in it."
          : "That doesn't look like an Apple Health export. In the Health app, tap your picture → Export All Health Data, then pick the export.zip here.",
      );
    }
    return {
      format: "apple-health",
      entries,
      skippedRows: this.skippedRows,
      sameDayRows: this.sameDayRows,
      outlierRows: 0,
    };
  }
}

/** Parses a whole `export.xml` held in memory; for small files and tests. */
export function parseAppleHealthWeights(text: string): ParsedWeightCsv {
  const scanner = new AppleHealthWeightScanner();
  scanner.push(text);
  return scanner.finish();
}
