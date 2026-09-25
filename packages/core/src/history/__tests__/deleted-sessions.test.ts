import { describe, expect, it } from "vitest";
import { deletedSessionExerciseIds, withoutDeletedSessionRecords } from "../deleted-sessions";

const DELETED = new Date("2026-09-25T00:00:00.000Z");

describe("deletedSessionExerciseIds", () => {
  it("includes every session exercise of a deleted session", () => {
    const ids = deletedSessionExerciseIds(
      [
        { id: "kept", deletedAt: null },
        { id: "gone", deletedAt: DELETED },
      ],
      [
        { id: "se-kept", sessionId: "kept", deletedAt: null },
        { id: "se-gone-1", sessionId: "gone", deletedAt: null },
        { id: "se-gone-2", sessionId: "gone", deletedAt: null },
      ],
    );
    expect([...ids].sort()).toEqual(["se-gone-1", "se-gone-2"]);
  });

  it("includes a session exercise removed from a live session", () => {
    const ids = deletedSessionExerciseIds(
      [{ id: "kept", deletedAt: null }],
      [{ id: "se-removed", sessionId: "kept", deletedAt: DELETED }],
    );
    expect([...ids]).toEqual(["se-removed"]);
  });

  it("keeps a session exercise whose session wasn't loaded", () => {
    const ids = deletedSessionExerciseIds(
      [],
      [{ id: "se-orphan", sessionId: "unknown", deletedAt: null }],
    );
    expect(ids.size).toBe(0);
  });
});

describe("withoutDeletedSessionRecords", () => {
  const sets = [
    { id: "set-live", sessionExerciseId: "se-live" },
    { id: "set-deleted", sessionExerciseId: "se-deleted" },
  ];

  it("drops a PR set in a deleted session and keeps the rest", () => {
    const records = [
      { id: "pr-live", setId: "set-live" },
      { id: "pr-deleted", setId: "set-deleted" },
      { id: "pr-no-set", setId: null },
      { id: "pr-unknown-set", setId: "set-not-loaded" },
    ];
    const kept = withoutDeletedSessionRecords(records, sets, new Set(["se-deleted"]));
    expect(kept.map((record) => record.id)).toEqual(["pr-live", "pr-no-set", "pr-unknown-set"]);
  });

  it("returns every record when nothing is deleted", () => {
    const records = [{ id: "pr-deleted", setId: "set-deleted" }];
    expect(withoutDeletedSessionRecords(records, sets, new Set())).toEqual(records);
  });
});
