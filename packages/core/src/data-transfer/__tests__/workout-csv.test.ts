import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "../csv";
import {
  WorkoutCsvError,
  convertWeight,
  exerciseNameQueries,
  isExactExerciseName,
  parseDurationSeconds,
  parseWorkoutCsv,
  toStrongCsv,
} from "../workout-csv";

const STRONG = [
  "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE",
  '2024-01-15 07:05:12,Push Day,1h 5m,Bench Press (Barbell),W,60,10,0,0,"Felt good, easy",,',
  "2024-01-15 07:05:12,Push Day,1h 5m,Bench Press (Barbell),1,100,5,0,0,,,8",
  "2024-01-15 07:05:12,Push Day,1h 5m,Bench Press (Barbell),2,100,5,0,0,,,8.5",
  "2024-01-15 07:05:12,Push Day,1h 5m,Bench Press (Barbell),Rest Timer,0,0,0,90,,,",
  "2024-01-15 07:05:12,Push Day,1h 5m,Plank,1,0,0,0,60,,,",
  "2024-01-17 18:00:00,Legs,45m,Squat (Barbell),1,140,3,0,0,,Heavy day,",
].join("\n");

const HEVY = [
  '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"',
  '"Upper","15 Jan 2024, 07:05","15 Jan 2024, 08:10","","Bench Press (Barbell)","0","","0","warmup","40","10","","",""',
  '"Upper","15 Jan 2024, 07:05","15 Jan 2024, 08:10","","Bench Press (Barbell)","0","","1","normal","80","5","","","9"',
  '"Upper","15 Jan 2024, 07:05","15 Jan 2024, 08:10","","Bent Over Row (Barbell)","0","","0","failure","70","8","","",""',
  '"Upper","15 Jan 2024, 07:05","15 Jan 2024, 08:10","","Triceps Pushdown","","","0","dropset","30","12","","",""',
].join("\n");

describe("parseCsv", () => {
  it("handles quotes, embedded delimiters and newlines, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, ""y""","line\nbreak"\r\n\r\n')).toEqual([
      ["a", "b"],
      ['x, "y"', "line\nbreak"],
    ]);
  });

  it("sniffs a semicolon delimiter", () => {
    expect(parseCsv("a;b;c\n1;2,5;3")).toEqual([
      ["a", "b", "c"],
      ["1", "2,5", "3"],
    ]);
  });

  it("round-trips through toCsv", () => {
    const rows = [
      ["name", "note"],
      ["Bench", 'said "hi", then\nleft'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("parseWorkoutCsv — Strong", () => {
  const { format, workouts } = parseWorkoutCsv(STRONG);

  it("detects the format and groups rows into workouts and exercises", () => {
    expect(format).toBe("strong");
    expect(workouts).toHaveLength(2);
    const [push, legs] = workouts;
    expect(push?.name).toBe("Push Day");
    expect(push?.startedAt).toEqual(new Date(2024, 0, 15, 7, 5, 12));
    expect(push?.endedAt).toEqual(new Date(2024, 0, 15, 8, 10, 12));
    expect(push?.exercises.map((e) => e.name)).toEqual(["Bench Press (Barbell)", "Plank"]);
    expect(legs?.notes).toBe("Heavy day");
  });

  it("keeps every set with its kind, weight, reps, RPE and time, skipping rest-timer rows", () => {
    const bench = workouts[0]?.exercises[0];
    expect(bench?.notes).toBe("Felt good, easy");
    expect(bench?.sets).toEqual([
      {
        kind: "warmup",
        weight: 60,
        weightUnit: null,
        reps: 10,
        durationSeconds: null,
        distance: null,
        rpe: null,
      },
      {
        kind: "working",
        weight: 100,
        weightUnit: null,
        reps: 5,
        durationSeconds: null,
        distance: null,
        rpe: 8,
      },
      {
        kind: "working",
        weight: 100,
        weightUnit: null,
        reps: 5,
        durationSeconds: null,
        distance: null,
        rpe: 8.5,
      },
    ]);
    expect(workouts[0]?.exercises[1]?.sets[0]?.durationSeconds).toBe(60);
  });

  it("reads the older semicolon layout with a per-row weight unit and decimal commas", () => {
    const legacy = [
      "Date;Workout Name;Exercise Name;Set Order;Weight;Weight Unit;Reps;RPE;Distance;Distance Unit;Seconds;Notes;Workout Notes;Workout Duration",
      "2020-03-01 10:00:00;A;Deadlift (Barbell);1;102,5;kg;5;;;;0;;;50m",
    ].join("\n");
    const [workout] = parseWorkoutCsv(legacy).workouts;
    expect(workout?.exercises[0]?.sets[0]).toMatchObject({ weight: 102.5, weightUnit: "kg" });
    expect(workout?.endedAt).toEqual(new Date(2020, 2, 1, 10, 50, 0));
  });
});

describe("parseWorkoutCsv — Hevy", () => {
  const { format, workouts } = parseWorkoutCsv(HEVY);

  it("detects the format, the unit from the column name, and set types", () => {
    expect(format).toBe("hevy");
    const [upper] = workouts;
    expect(upper?.startedAt).toEqual(new Date(2024, 0, 15, 7, 5));
    expect(upper?.endedAt).toEqual(new Date(2024, 0, 15, 8, 10));
    const [bench, row, pushdown] = upper?.exercises ?? [];
    expect(bench?.sets.map((s) => s.kind)).toEqual(["warmup", "working"]);
    expect(bench?.sets[1]).toMatchObject({ weight: 80, weightUnit: "kg", reps: 5, rpe: 9 });
    expect(row?.sets[0]?.kind).toBe("failure");
    expect(pushdown?.sets[0]?.kind).toBe("drop");
    expect(bench?.supersetKey).toBe("0");
    expect(row?.supersetKey).toBe("0");
    expect(pushdown?.supersetKey).toBeNull();
  });
});

describe("parseWorkoutCsv — errors", () => {
  it("rejects files that aren't a Strong or Hevy export", () => {
    expect(() => parseWorkoutCsv("")).toThrow(WorkoutCsvError);
    expect(() => parseWorkoutCsv("foo,bar\n1,2")).toThrow(WorkoutCsvError);
  });
});

describe("toStrongCsv", () => {
  it("writes one row per set that parses back to the same workout", () => {
    const startedAt = new Date(2024, 4, 2, 6, 30, 0);
    const csv = toStrongCsv([
      {
        name: "Pull",
        startedAt,
        endedAt: new Date(startedAt.getTime() + 75 * 60_000),
        notes: "Gym, busy",
        exercises: [
          {
            name: "Barbell Deadlift",
            notes: null,
            sets: [
              {
                kind: "warmup",
                weight: 60,
                reps: 5,
                durationSeconds: null,
                distance: null,
                rpe: null,
              },
              {
                kind: "working",
                weight: 180,
                reps: 3,
                durationSeconds: null,
                distance: null,
                rpe: 9,
              },
              {
                kind: "failure",
                weight: 180,
                reps: 2,
                durationSeconds: null,
                distance: null,
                rpe: null,
              },
            ],
          },
        ],
      },
    ]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe(
      '2024-05-02 06:30:00,Pull,1h 15m,Barbell Deadlift,W,60,5,0,0,,"Gym, busy",',
    );
    expect(lines[2]).toContain(",1,180,3,");

    const [workout] = parseWorkoutCsv(csv).workouts;
    expect(workout?.startedAt).toEqual(startedAt);
    expect(workout?.notes).toBe("Gym, busy");
    expect(workout?.exercises[0]?.sets.map((s) => [s.kind, s.weight, s.reps, s.rpe])).toEqual([
      ["warmup", 60, 5, null],
      ["working", 180, 3, 9],
      ["failure", 180, 2, null],
    ]);
  });
});

describe("helpers", () => {
  it("parses durations", () => {
    expect(parseDurationSeconds("1h 5m")).toBe(3900);
    expect(parseDurationSeconds("45m")).toBe(2700);
    expect(parseDurationSeconds("90")).toBe(90);
    expect(parseDurationSeconds("")).toBeNull();
  });

  it("converts weights to 2 decimals", () => {
    expect(convertWeight(100, "kg", "lb")).toBe(220.46);
    expect(convertWeight(225, "lb", "kg")).toBe(102.06);
    expect(convertWeight(100, "kg", "kg")).toBe(100);
  });

  it("turns Strong-style names into catalog queries", () => {
    expect(exerciseNameQueries("Bench Press (Barbell)")).toEqual([
      "Bench Press (Barbell)",
      "Barbell Bench Press",
      "Bench Press",
    ]);
    expect(exerciseNameQueries("Plank")).toEqual(["Plank"]);
  });

  it("matches exact names and aliases ignoring case and punctuation", () => {
    const exercise = { name: "Barbell Bench Press - Medium Grip", aliases: ["bench press"] };
    expect(isExactExerciseName(exercise, "Bench-Press")).toBe(true);
    expect(isExactExerciseName(exercise, "barbell bench press medium grip")).toBe(true);
    expect(isExactExerciseName(exercise, "Incline Bench Press")).toBe(false);
  });
});
