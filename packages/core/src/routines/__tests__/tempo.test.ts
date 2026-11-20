import { describe, expect, it } from "vitest";
import {
  formatTempo,
  parseTempo,
  sharedTempo,
  tempoCueSchedule,
  tempoFromInputs,
  tempoPhaseAt,
  tempoSecondsPerRep,
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

  it("rejects two or four phases", () => {
    expect(parseTempo("3-1")).toBeNull();
    expect(parseTempo("3-1-1-0")).toBeNull();
    expect(parseTempo("3110")).toBeNull();
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
    for (const text of ["3-1-1", "2-0-X", "10-2-3"]) {
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
