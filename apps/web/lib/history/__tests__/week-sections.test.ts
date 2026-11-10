import { describe, expect, it } from "vitest";
import { groupSessionsByWeek, summarizeWeek, weekLabel } from "../week-sections";

function session(day: number, minutes: number, volume: number, prCount = 0) {
  const startedAt = new Date(2026, 10, day, 18, 0);
  return {
    startedAt,
    endedAt: new Date(startedAt.getTime() + minutes * 60_000),
    totalVolume: volume,
    prCount,
  };
}

// Tuesday, November 10, 2026; weeks start Monday (1).
const NOW = new Date(2026, 10, 10, 15, 0);

describe("groupSessionsByWeek (#783)", () => {
  it("groups newest-first sessions into labelled weeks", () => {
    const sessions = [session(9, 42, 12_310), session(7, 61, 24_900, 2), session(5, 55, 18_000)];
    const weeks = groupSessionsByWeek(sessions, 1, NOW);
    expect(weeks.map((week) => week.label)).toEqual(["This week", "Last week"]);
    expect(weeks[1]?.sessions).toHaveLength(2);
  });

  it("names older weeks by their first day", () => {
    const weeks = groupSessionsByWeek([session(1, 30, 1000)], 1, NOW);
    expect(weeks[0]?.label).toBe(weekLabel(new Date(2026, 9, 26), NOW, 1));
    expect(weeks[0]?.label).toMatch(/^Week of /);
  });

  it("follows the user's week start", () => {
    // Sunday the 8th is last week for Monday weeks, this week for Sunday weeks.
    expect(groupSessionsByWeek([session(8, 30, 1000)], 1, NOW)[0]?.label).toBe("Last week");
    expect(groupSessionsByWeek([session(8, 30, 1000)], 0, NOW)[0]?.label).toBe("This week");
  });
});

describe("summarizeWeek (#783)", () => {
  it("adds up workouts, minutes, volume and PRs", () => {
    expect(summarizeWeek([session(7, 61, 24_900, 2), session(5, 55, 18_000)])).toEqual({
      workouts: 2,
      minutes: 116,
      volume: 42_900,
      prs: 2,
    });
  });
});
