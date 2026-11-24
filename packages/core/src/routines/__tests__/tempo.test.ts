import { describe, expect, it } from "vitest";
import {
  formatTempo,
  parseTempo,
  sharedTempo,
  tempoCueSchedule,
  tempoFromInputs,
  tempoPhaseAt,
  tempoPositionAt,
  tempoSecondsPerRep,
  tempoSetCues,
} from "../tempo";

describe("parseTempo", () => {
  it("reads the hyphenated form", () => {
    expect(parseTempo("3-1-1")).toEqual([3, 1, 1]);
  });

  it("reads the compact form", () => {
    expect(parseTempo("31X")).toEqual([3, 1, "X"]);
  });

  it("reads a lowercase x on the lift", () => {
    expect(parseTempo("3-1-x")).toEqual([3, 1, "X"]);
  });

  it("allows two-digit phases up to 20 seconds", () => {
    expect(parseTempo("20-0-1")).toEqual([20, 0, 1]);
    expect(parseTempo("21-0-1")).toBeNull();
  });

  it("rejects X outside the lift", () => {
    expect(parseTempo("X-1-1")).toBeNull();
    expect(parseTempo("3-X-1")).toBeNull();
  });

  it("rejects two or five phases", () => {
    expect(parseTempo("3-1")).toBeNull();
    expect(parseTempo("3-1-1-1-1")).toBeNull();
    expect(parseTempo("31101")).toBeNull();
  });

  it("reads a fourth phase as the time between reps (issue #867)", () => {
    expect(parseTempo("3-1-1-2")).toEqual([3, 1, 1, 2]);
    expect(parseTempo("31X2")).toEqual([3, 1, "X", 2]);
  });

  it("drops a 0 between, so it reads like a three-phase tempo", () => {
    expect(parseTempo("3-1-1-0")).toEqual([3, 1, 1]);
    expect(parseTempo("3110")).toEqual([3, 1, 1]);
  });

  it("rejects X or more than 20 seconds between reps", () => {
    expect(parseTempo("3-1-1-X")).toBeNull();
    expect(parseTempo("3-1-1-21")).toBeNull();
  });

  it("rejects a tempo that is only time between reps", () => {
    expect(parseTempo("0-0-0-2")).toBeNull();
  });

  it("rejects every phase at 0", () => {
    expect(parseTempo("0-0-0")).toBeNull();
  });

  it("rejects letters, decimals and negatives", () => {
    expect(parseTempo("a-1-1")).toBeNull();
    expect(parseTempo("1.5-1-1")).toBeNull();
    expect(parseTempo("-1-1-1")).toBeNull();
  });

  it("reads nothing as no tempo", () => {
    expect(parseTempo(null)).toBeNull();
    expect(parseTempo(undefined)).toBeNull();
    expect(parseTempo("  ")).toBeNull();
  });
});

describe("formatTempo", () => {
  it("round-trips through parseTempo in canonical form", () => {
    for (const text of ["3-1-1", "2-0-X", "10-2-3", "3-1-1-2", "2-0-X-5"]) {
      const tempo = parseTempo(text);
      expect(tempo && formatTempo(tempo)).toBe(text);
    }
    const compact = parseTempo("31x");
    expect(compact && formatTempo(compact)).toBe("3-1-X");
  });
});

describe("tempoSecondsPerRep", () => {
  it("adds the three phases", () => {
    expect(tempoSecondsPerRep([3, 1, 1])).toBe(5);
  });

  it("counts an X lift as half a second", () => {
    expect(tempoSecondsPerRep([2, 0, "X"])).toBe(2.5);
  });

  it("includes the time between reps", () => {
    expect(tempoSecondsPerRep([3, 1, 1, 2])).toBe(7);
  });
});

describe("tempoFromInputs", () => {
  it("saves the canonical string", () => {
    expect(tempoFromInputs("3", "1", "x")).toBe("3-1-X");
  });

  it("saves null when all three are empty", () => {
    expect(tempoFromInputs("", " ", "")).toBeNull();
  });

  it("counts an empty input as 0 once another is filled", () => {
    expect(tempoFromInputs("3", "", "1")).toBe("3-0-1");
  });

  it("marks inputs that don't make a tempo as invalid", () => {
    expect(tempoFromInputs("X", "1", "1")).toBe("invalid");
    expect(tempoFromInputs("0", "0", "0")).toBe("invalid");
    expect(tempoFromInputs("30", "1", "1")).toBe("invalid");
  });
});

describe("tempoCueSchedule", () => {
  it("cues the first second of each phase and ticks the rest", () => {
    expect(tempoCueSchedule([3, 1, 1])).toEqual(["down", "tick", "tick", "pause", "up"]);
  });

  it("skips a 0-second pause", () => {
    expect(tempoCueSchedule([2, 0, 1])).toEqual(["down", "tick", "up"]);
  });

  it("plays an X lift as one up", () => {
    expect(tempoCueSchedule([2, 0, "X"])).toEqual(["down", "tick", "up"]);
  });

  it("ticks through long phases", () => {
    expect(tempoCueSchedule([5, 2, 2])).toEqual([
      "down",
      "tick",
      "tick",
      "tick",
      "tick",
      "pause",
      "tick",
      "up",
      "tick",
    ]);
  });
});

describe("tempoPhaseAt", () => {
  it("names the phase each second falls in, ticks included", () => {
    const phases = [0, 1, 2, 3, 4].map((second) => tempoPhaseAt([3, 1, 1], second));
    expect(phases).toEqual(["down", "down", "down", "pause", "up"]);
  });

  it("loops for the next rep", () => {
    expect(tempoPhaseAt([3, 1, 1], 5)).toBe("down");
    expect(tempoPhaseAt([3, 1, 1], 9.7)).toBe("up");
  });
});

describe("sharedTempo", () => {
  it("is none when no lift has a tempo", () => {
    expect(sharedTempo([])).toEqual({ kind: "none" });
    expect(sharedTempo([null, undefined, ""])).toEqual({ kind: "none" });
  });

  it("is the tempo when every lift has the same one, in canonical form", () => {
    expect(sharedTempo(["3-1-1", "311", "3-1-1"])).toEqual({ kind: "same", tempo: "3-1-1" });
  });

  it("is mixed when lifts differ or only some are set", () => {
    expect(sharedTempo(["3-1-1", "2-0-X"])).toEqual({ kind: "mixed" });
    expect(sharedTempo(["3-1-1", null])).toEqual({ kind: "mixed" });
  });

  it("treats a value that isn't a tempo as none", () => {
    expect(sharedTempo(["nope", null])).toEqual({ kind: "none" });
    expect(sharedTempo(["3-1-1", "9-9"])).toEqual({ kind: "mixed" });
  });
});

describe("time between reps and the reps box (issue #867)", () => {
  it("saves a Between input as the fourth phase", () => {
    expect(tempoFromInputs("3", "1", "1", "2")).toBe("3-1-1-2");
    expect(tempoFromInputs("3", "1", "1", "0")).toBe("3-1-1");
    expect(tempoFromInputs("", "", "", "2")).toBe("invalid");
    expect(tempoFromInputs("3", "1", "1", "X")).toBe("invalid");
  });

  it("cues the time between after the lift", () => {
    expect(tempoCueSchedule([2, 0, 1, 2])).toEqual(["down", "tick", "up", "between", "tick"]);
  });

  it("runs a set for the reps given, with no time between after the last", () => {
    expect(tempoSetCues([1, 0, 1, 2], 2)).toEqual(["down", "up", "between", "tick", "down", "up"]);
    expect(tempoSetCues([3, 1, 1], 3)).toHaveLength(15);
    expect(tempoSetCues([3, 1, 1], null)).toBeNull();
  });

  it("tracks the phase and rep, and ends after the last rep", () => {
    const tempo = [1, 0, 1, 1] as const;
    expect(tempoPositionAt(tempo, 0, 2)).toEqual({ phase: "down", rep: 1 });
    expect(tempoPositionAt(tempo, 2, 2)).toEqual({ phase: "between", rep: 1 });
    expect(tempoPositionAt(tempo, 4, 2)).toEqual({ phase: "up", rep: 2 });
    expect(tempoPositionAt(tempo, 5, 2)).toBeNull();
    expect(tempoPositionAt(tempo, 50)).toEqual({ phase: "between", rep: 17 });
  });
});
