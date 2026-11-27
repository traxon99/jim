import { describe, expect, it } from "vitest";
import {
  MUSCLE_TARGETS,
  MUSCLE_TREE,
  groupOfTarget,
  groupTagsFromTargets,
  muscleTargetChildren,
  muscleTargetPath,
  muscleTargetsError,
  pickTarget,
  targetWeights,
  targetsToSave,
} from "../muscle-tree";
import { MUSCLES } from "../muscles";

describe("muscle tree (#874)", () => {
  it("has every group at the top, and unique ids", () => {
    const groups = MUSCLE_TREE.filter((node) => node.parent === null).map((node) => node.id);
    expect(groups).toEqual([...MUSCLES]);
    expect(new Set(MUSCLE_TARGETS).size).toBe(MUSCLE_TARGETS.length);
  });

  it("never goes deeper than group, muscle, head", () => {
    for (const id of MUSCLE_TARGETS) expect(muscleTargetPath(id).length).toBeLessThanOrEqual(3);
  });

  it("splits the middle back into the rhomboids alone", () => {
    expect(muscleTargetChildren("middle back").map((node) => node.id)).toEqual(["rhomboids"]);
    expect(groupOfTarget("middle_traps")).toBe("traps");
    expect(groupOfTarget("rear_delt")).toBe("shoulders");
  });

  it("counts a set once per node, at the highest weight beneath it", () => {
    const weights = targetWeights(
      { primaryTargets: ["lower_chest"], secondaryTargets: ["upper_chest", "front_delt"] },
      1,
      0.5,
    );
    expect(weights.get("pectoralis_major")).toBe(1);
    expect(weights.get("chest")).toBe(1);
    expect(weights.get("upper_chest")).toBe(0.5);
    expect(weights.get("shoulders")).toBe(0.5);
    expect(weights.has("rear_delt")).toBe(false);
  });

  it("derives group tags: primary if anything under the group is primary", () => {
    expect(
      groupTagsFromTargets({
        primaryTargets: ["latissimus_dorsi", "middle_traps", "rhomboids"],
        secondaryTargets: ["rear_delt", "biceps_brachii", "teres_major"],
      }),
    ).toEqual({
      primaryMuscles: ["lats", "middle back", "traps"],
      secondaryMuscles: ["biceps", "shoulders"],
    });
  });

  it("accepts a group-level tag, so untouched exercises still work", () => {
    expect(groupTagsFromTargets({ primaryTargets: ["chest"], secondaryTargets: [] })).toEqual({
      primaryMuscles: ["chest"],
      secondaryMuscles: [],
    });
  });

  it("rejects unknown ids, double tags and a primary inside another primary", () => {
    expect(muscleTargetsError({ primaryTargets: ["lats"], secondaryTargets: [] })).toBeNull();
    expect(muscleTargetsError({ primaryTargets: ["pecs"], secondaryTargets: [] })).toMatch(
      /Unknown/,
    );
    expect(
      muscleTargetsError({ primaryTargets: ["side_delt"], secondaryTargets: ["side_delt"] }),
    ).toMatch(/both/);
    expect(
      muscleTargetsError({ primaryTargets: ["side_delt", "shoulders"], secondaryTargets: [] }),
    ).toMatch(/inside/);
  });
});

describe("tree muscle picker (#879)", () => {
  it("picks a group, then swaps it for a muscle inside it", () => {
    let lists = pickTarget([], [], "shoulders");
    expect(lists.picked).toEqual(["shoulders"]);
    lists = pickTarget(lists.picked, [], "side_delt");
    expect(lists.picked).toEqual(["side_delt"]);
    lists = pickTarget(lists.picked, [], "rear_delt");
    expect(lists.picked).toEqual(["side_delt", "rear_delt"]);
  });

  it("falls back to the group when its last muscle is dropped, and clears it from the group", () => {
    expect(pickTarget(["side_delt"], [], "side_delt").picked).toEqual(["shoulders"]);
    expect(pickTarget(["side_delt", "chest"], [], "shoulders").picked).toEqual(["chest"]);
  });

  it("takes a pick and what's inside it out of the other list only", () => {
    const lists = pickTarget(["front_delt"], ["side_delt", "deltoid", "triceps"], "deltoid");
    expect(lists).toEqual({ picked: ["deltoid"], other: ["triceps"] });
  });

  it("saves plain groups without node tags, and node tags with derived groups", () => {
    expect(targetsToSave(["chest"], ["triceps"])).toEqual({
      primaryMuscles: ["chest"],
      secondaryMuscles: ["triceps"],
      primaryTargets: [],
      secondaryTargets: [],
    });
    expect(targetsToSave(["side_delt"], ["upper_traps"])).toEqual({
      primaryMuscles: ["shoulders"],
      secondaryMuscles: ["traps"],
      primaryTargets: ["side_delt"],
      secondaryTargets: ["upper_traps"],
    });
  });
});
