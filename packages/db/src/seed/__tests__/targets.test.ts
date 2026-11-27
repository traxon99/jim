import { MUSCLE_TARGETS, muscleTargetsError } from "@jim/core";
import { describe, expect, it } from "vitest";
import { STAPLE_TARGETS, targetsFor, withTargets } from "../targets";

const row = (slug: string, name: string, primary: string[], secondary: string[] = []) => ({
  slug,
  name,
  primaryMuscles: primary,
  secondaryMuscles: secondary,
});

describe("muscle tree tags for the catalog (#874)", () => {
  it("uses only real tree ids in the hand-tagged staples", () => {
    for (const [slug, tags] of Object.entries(STAPLE_TARGETS)) {
      const error = muscleTargetsError({ primaryTargets: tags.p, secondaryTargets: tags.s ?? [] });
      expect(error, slug).toBeNull();
      for (const id of [...tags.p, ...(tags.s ?? [])]) expect(MUSCLE_TARGETS).toContain(id);
    }
  });

  it("tags a row with the muscles it works, not the middle back", () => {
    const tags = targetsFor(
      row("x-row", "Bent Over Two-Dumbbell Row", ["middle back"], ["lats", "biceps"]),
    );
    expect(tags.primaryTargets).toEqual(
      expect.arrayContaining(["latissimus_dorsi", "middle_traps", "rhomboids"]),
    );
    expect(tags.secondaryTargets).toContain("rear_delt");
  });

  it("splits the delts by what the lift does", () => {
    expect(
      targetsFor(row("a", "Cable Seated Lateral Raise", ["shoulders"])).primaryTargets,
    ).toEqual(["side_delt"]);
    expect(targetsFor(row("b", "Cable Rear Delt Fly", ["shoulders"])).primaryTargets).toEqual([
      "rear_delt",
    ]);
    expect(
      targetsFor(row("c", "Dumbbell Bench Press Variation", ["chest"], ["shoulders"]))
        .secondaryTargets,
    ).toEqual(["front_delt"]);
  });

  it("keeps a group no rule can resolve at group level", () => {
    const tags = targetsFor(row("d", "Mystery Move", ["neck"]));
    expect(tags).toEqual({ primaryTargets: ["neck"], secondaryTargets: [], source: "groups" });
  });

  it("re-derives the row's group tags from its new tags", () => {
    const tagged = withTargets({
      ...row("thigh-abductor", "Thigh Abductor", ["abductors"]),
      trackingType: "weight_reps",
    } as never);
    expect(tagged.primaryMuscles).toEqual(["glutes"]);
    expect(tagged.primaryTargets).toEqual(["gluteus_medius", "gluteus_minimus"]);
  });
});
