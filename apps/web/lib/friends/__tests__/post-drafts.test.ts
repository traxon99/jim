import { describe, expect, it } from "vitest";
import { achievementPostDraft, recordPostDraft, workoutPostDraft } from "../post-drafts";

describe("post drafts", () => {
  it("sums up a workout in the summary screen's numbers", () => {
    const draft = workoutPostDraft(
      { id: "s1", name: "Push Day" },
      { durationSeconds: 3125, setCount: 18, totalVolume: 12345.6, prCount: 1 },
      "lb",
    );
    expect(draft).toEqual({
      kind: "workout",
      sessionId: "s1",
      title: "Push Day",
      detail: "52 min · 18 sets · 12,346 lb volume · 1 PR",
    });
  });

  it("names an unnamed workout and skips empty numbers", () => {
    const draft = workoutPostDraft(
      { id: "s1", name: null },
      { durationSeconds: 600, setCount: 1, totalVolume: 0, prCount: 0 },
      "kg",
    );
    expect(draft).toMatchObject({ title: "Workout", detail: "10 min · 1 set" });
  });

  it("describes a record with its units, or reps for a rep record", () => {
    expect(recordPostDraft("Bench Press", { kind: "1rm", value: 231.456 }, "lb")).toEqual({
      kind: "record",
      sessionId: null,
      title: "Bench Press",
      detail: "Estimated 1RM · 231.46 lb",
    });
    expect(recordPostDraft("Curl", { kind: "reps_at_weight", value: 12 }, "kg").detail).toBe(
      "Most reps at a weight · 12 reps",
    );
  });

  it("shares an achievement by its title and description", () => {
    expect(
      achievementPostDraft({ title: "First workout", description: "Finish a workout" }),
    ).toEqual({
      kind: "achievement",
      sessionId: null,
      title: "First workout",
      detail: "Finish a workout",
    });
  });
});
