import { describe, expect, it } from "vitest";
import {
  type LeaderboardRow,
  leaderboardMachineKey,
  leaderboardWindow,
  rankLeaderboard,
} from "../leaderboard";

function row(partial: Partial<LeaderboardRow> & Pick<LeaderboardRow, "userId">): LeaderboardRow {
  return {
    username: partial.userId,
    avatar: null,
    isMe: false,
    units: "lb",
    bestE1rm: null,
    bestE1rmAt: null,
    bestWeight: null,
    bestWeightReps: null,
    bestWeightAt: null,
    relativeStrength: null,
    ...partial,
  };
}

const rows: LeaderboardRow[] = [
  row({
    userId: "me",
    isMe: true,
    bestE1rm: 225,
    bestE1rmAt: "2026-10-01T00:00:00Z",
    bestWeight: 200,
    bestWeightReps: 3,
    bestWeightAt: "2026-10-01T00:00:00Z",
    relativeStrength: 1.2,
  }),
  row({
    userId: "kg-friend",
    units: "kg",
    bestE1rm: 120, // 264.55 lb
    bestE1rmAt: "2026-10-05T00:00:00Z",
    bestWeight: 100, // 220.46 lb
    bestWeightReps: 5,
    bestWeightAt: "2026-10-05T00:00:00Z",
    relativeStrength: 1.6,
  }),
  row({
    userId: "no-share",
    bestE1rm: 250,
    bestE1rmAt: "2026-09-01T00:00:00Z",
    bestWeight: 190,
    bestWeightReps: 8,
    bestWeightAt: "2026-09-01T00:00:00Z",
  }),
];

describe("rankLeaderboard", () => {
  it("ranks by e1RM in the viewer's units", () => {
    const ranked = rankLeaderboard(rows, "e1rm", "lb");
    expect(ranked.map((e) => [e.rank, e.userId, e.value])).toEqual([
      [1, "kg-friend", 264.55],
      [2, "no-share", 250],
      [3, "me", 225],
    ]);
  });

  it("converts lb logs for a kg viewer", () => {
    const ranked = rankLeaderboard(rows, "e1rm", "kg");
    expect(ranked.find((e) => e.userId === "me")?.value).toBe(102.06);
    expect(ranked[0]?.userId).toBe("kg-friend");
  });

  it("ranks the best set by weight and carries its reps", () => {
    const ranked = rankLeaderboard(rows, "best_set", "lb");
    expect(ranked.map((e) => [e.userId, e.value, e.reps])).toEqual([
      ["kg-friend", 220.46, 5],
      ["me", 200, 3],
      ["no-share", 190, 8],
    ]);
  });

  it("ranks relative strength and leaves out anyone who doesn't share it", () => {
    const ranked = rankLeaderboard(rows, "relative", "lb");
    expect(ranked.map((e) => [e.userId, e.value])).toEqual([
      ["kg-friend", 1.6],
      ["me", 1.2],
    ]);
  });

  it("breaks a tie in favour of whoever set it first", () => {
    const ranked = rankLeaderboard(
      [
        row({ userId: "late", bestE1rm: 200, bestE1rmAt: "2026-10-09T00:00:00Z" }),
        row({ userId: "early", bestE1rm: 200, bestE1rmAt: "2026-10-01T00:00:00Z" }),
        // 90.72 kg is 200.00 lb after rounding, so it ties too.
        row({ userId: "kg", units: "kg", bestE1rm: 90.72, bestE1rmAt: "2026-10-05T00:00:00Z" }),
      ],
      "e1rm",
      "lb",
    );
    expect(ranked.map((e) => e.userId)).toEqual(["early", "kg", "late"]);
    expect(ranked.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it("returns nothing for an empty board", () => {
    expect(rankLeaderboard([], "e1rm", "lb")).toEqual([]);
  });
});

describe("leaderboardWindow", () => {
  const many = rankLeaderboard(
    Array.from({ length: 8 }, (_, i) =>
      row({
        userId: `u${i}`,
        isMe: i === 6,
        bestE1rm: 300 - i,
        bestE1rmAt: "2026-10-01T00:00:00Z",
      }),
    ),
    "e1rm",
    "lb",
  );

  it("shows the top rows and the viewer's real rank when they're below the cut", () => {
    const { top, me } = leaderboardWindow(many, 5);
    expect(top.map((e) => e.userId)).toEqual(["u0", "u1", "u2", "u3", "u4"]);
    expect(me).toMatchObject({ userId: "u6", rank: 7 });
  });

  it("has no separate row when the viewer is already in the top", () => {
    const { top, me } = leaderboardWindow(many, 7);
    expect(top.some((e) => e.isMe)).toBe(true);
    expect(me).toBeNull();
  });
});

describe("leaderboardMachineKey", () => {
  const gym = { latitude: 40, longitude: -75 };

  it("treats an exercise without machine details as a plain board", () => {
    expect(leaderboardMachineKey({})).toEqual({ eligible: true, machine: null });
    expect(leaderboardMachineKey({ machineBrand: " ", machineModel: "" })).toEqual({
      eligible: true,
      machine: null,
    });
  });

  it("needs both make and model", () => {
    expect(leaderboardMachineKey({ machineBrand: "Rogue", gym })).toEqual({
      eligible: false,
      reason: "make-model",
    });
  });

  it("needs a gym pinned on the map", () => {
    expect(leaderboardMachineKey({ machineBrand: "Rogue", machineModel: "X" })).toEqual({
      eligible: false,
      reason: "gym",
    });
    expect(
      leaderboardMachineKey({
        machineBrand: "Rogue",
        machineModel: "X",
        gym: { latitude: null, longitude: null },
      }),
    ).toEqual({ eligible: false, reason: "gym" });
  });

  it("returns the trimmed key for a complete machine", () => {
    expect(leaderboardMachineKey({ machineBrand: " Rogue ", machineModel: "Cable", gym })).toEqual({
      eligible: true,
      machine: { brand: "Rogue", model: "Cable", latitude: 40, longitude: -75 },
    });
  });
});
