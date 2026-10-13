import { describe, expect, it } from "vitest";
import { exerciseMetaLine } from "../display";

describe("exerciseMetaLine (#548)", () => {
  it("names the machine's gym so identical machines can be told apart", () => {
    const gyms = new Map([
      ["g1", "Home Gym"],
      ["g2", "Downtown"],
    ]);
    const machine = { equipment: "machine", primaryMuscles: ["lats"], category: null };
    expect(exerciseMetaLine({ ...machine, gymId: "g1" }, gyms)).toBe("machine · Home Gym · lats");
    expect(exerciseMetaLine({ ...machine, gymId: "g2" }, gyms)).toBe("machine · Downtown · lats");
  });

  it("leads with the kind for warm-ups and cardio", () => {
    expect(
      exerciseMetaLine({ category: "cardio", equipment: null, primaryMuscles: [] }, undefined),
    ).toBe("cardio");
  });
});
