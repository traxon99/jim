# Jim read API (`/v1`)

A small, versioned, read-only JSON API for [Jackson OS](https://github.com/traxon99/jackson-os) and
other server-side readers (ADR-022). It's served by the MCP server at `https://jim-mcp.fly.dev/v1`
and returns the same numbers as the matching MCP read tools, because each endpoint calls the same
code.

Nothing here can write. In particular nothing can start, change or end a workout: the phone owns
the live session (ADR-007).

## Auth

Send a personal access token:

```
Authorization: Bearer jim_pat_…
```

Create one in Jim under Settings → Advanced → Connect Claude → Access tokens. Pick **Read only**
for a dashboard: it can call every endpoint here and every MCP read tool, and no MCP write tool.
Read-and-write tokens work here too. Supabase/OAuth access tokens are not accepted.

Every query runs as the token's owner under Postgres row-level security, so a token only ever sees
its owner's data. A revoked or expired token stops working on the next request.

Server-to-server only: there are no CORS headers, and a browser should never hold the token.

## Responses

- Success: `200` with the endpoint's JSON and `Cache-Control: private, max-age=60`.
- Error: the status below, `Cache-Control: no-store`, and one shape for everything:

  ```json
  { "error": { "code": "unauthorized", "message": "The token is invalid, revoked or expired." } }
  ```

| Status | `code` | When |
|---|---|---|
| 400 | `bad_request` | A query parameter failed validation; `message` says which |
| 401 | `unauthorized` | No token, not a `jim_pat_` token, or invalid, revoked or expired |
| 404 | `not_found` | Unknown endpoint, or an id that doesn't exist for this user |
| 429 | `rate_limited` | Over the rate limit; see `Retry-After` |
| 500 | `internal` | Anything else. The message is generic; nothing about the database leaks |

Times are ISO 8601 instants in UTC (`2026-11-03T22:41:09.000Z`). Calendar days are `YYYY-MM-DD`
in the user's time zone. Weights are in the user's units (`user.units` on `/v1/status`).

## Rate limit

120 requests per minute per token. Over that, `429` with `Retry-After: <seconds>` and the
`RateLimit` / `RateLimit-Policy` headers (IETF draft 8). Separately, each IP gets 20 failed
sign-ins (`401`s) a minute before it's answered with `429` too.

## Versioning

Within `/v1`, changes are additive only: new endpoints, new fields, new enum values in fields
documented as open. Readers should ignore fields they don't know. Anything that would break a
reader (removing or renaming a field, changing a type or a unit) goes in `/v2`.

Response schemas are zod schemas in `@jim/core` (`packages/core/src/api/`), named `v1…Schema`.
Jackson OS mirrors them in its adapter.

## Endpoints

### `GET /v1/status`

Who the token belongs to, how fresh Jim's server data is, and the workout in progress, if any.
Use it as a health check. Schema: `v1StatusSchema`.

```json
{
  "user": { "username": "jackson", "units": "lb", "weekStart": 1, "timeZone": "America/Chicago" },
  "lastSyncedAt": "2026-11-03T22:41:09.000Z",
  "activeWorkout": { "id": "0193…", "name": "Push A", "startedAt": "2026-11-03T22:10:00.000Z" },
  "tokenScope": "read"
}
```

- `user.weekStart`: 0 = Sunday … 6 = Saturday. `user.timeZone` is null until the phone reports one.
- `lastSyncedAt`: when the phone last pushed changes. Jim's data only reaches the server when the
  phone syncs, so show this next to any numbers. Null if it never has.
- `activeWorkout`: the newest workout that hasn't ended, for display only, or null. `name` is the
  workout's name, else its routine's, else null.
- `tokenScope`: `read` or `read_write`.

### `GET /v1/weeks?weeks=1..12&goal=strength|hypertrophy`

This week and the weeks before it, newest first, from the same code as the `weekly_summary` MCP
tool. Defaults: `weeks=2`, `goal=hypertrophy` (Jim has no goal setting yet). Weeks start on the
user's week-start day in their time zone. Working sets only: warm-up sets, warm-up exercises and
cardio are left out. A rest week is listed with zeros. Schema: `v1WeeksSchema`.

```json
{
  "goal": "hypertrophy",
  "units": "lb",
  "weeks": [
    {
      "weekStart": "2026-11-02",
      "workouts": 3,
      "workingSets": 48,
      "volume": 41250,
      "durationMinutes": 165,
      "muscles": [
        { "muscle": "chest", "sets": 12, "target": { "low": 10, "high": 20 }, "status": "within" }
      ],
      "topExercises": [
        { "exerciseId": "…", "name": "Squat", "sets": 5, "volume": 7125 }
      ]
    }
  ]
}
```

- `muscles[].sets`: a secondary muscle counts half a set, so it can be fractional. `status` is
  `under`, `within` or `over` the goal's weekly range.
- `durationMinutes`: finished workouts that started that week.
- `topExercises`: top 5 by volume.

### `GET /v1/streak`

The training streak exactly as the Home tab shows it: consecutive weeks with at least the weekly
target of workouts, where the target is the active program's planned days (1 with no program).
The current week doesn't break the streak until it's over. Schema: `v1StreakSchema`.

```json
{ "weeks": 6, "target": 3, "thisWeek": { "done": 2, "target": 3 }, "longest": 11 }
```

### `GET /v1/workouts?from=&to=&limit=1..50`

Finished workouts, newest first, from the same code as `list_workouts`. `from`/`to` are ISO
instants bounding the start time; `limit` defaults to 10. Schema: `v1WorkoutsSchema`.

```json
{
  "units": "lb",
  "hasMore": true,
  "workouts": [
    {
      "id": "…",
      "name": "Push A",
      "routineName": "Push A",
      "startedAt": "2026-11-03T22:10:00.000Z",
      "endedAt": "2026-11-03T23:05:00.000Z",
      "durationMinutes": 55,
      "exerciseCount": 5,
      "workingSets": 18,
      "volume": 12450,
      "prCount": 1,
      "gym": "Home gym",
      "webPath": "/portal/workouts/…"
    }
  ]
}
```

- `workingSets`, `volume`: warm-up sets left out. `prCount`: PRs the app shows (estimated 1RM, and
  reps on bodyweight movements).
- `webPath`: the workout in Jim's web portal. Prefix it with Jim's web origin.
- `hasMore`: more workouts match than `limit`. For the next page, pass the last `startedAt` as `to`
  (it's inclusive, so drop the repeat).

### `GET /v1/workouts/:id`

One finished workout, from the same code as `get_workout`: the list fields plus `notes` and
`exercises[]` in order, each with `exerciseId`, `name`, `notes` and its current `sets[]` (`kind`,
`weight`, `reps`, `durationSeconds`, `distance`, `rpe`, `rir`, `completedAt`, and `prs`, the PR
kinds the set set that the app shows: `1rm`, or `reps_at_weight` on bodyweight movements). Sets are append-only in Jim, so an edited set shows its latest values and a
deleted set is gone. An unknown id, another user's workout, a deleted one or one still in
progress is a `404`. Schema: `v1WorkoutSchema`.

### `GET /v1/prs?since=&limit=1..50`

PRs set since `since` (default: the last 30 days), newest first, limit 20 by default. Same rows as
`get_prs` and the same rules as the app's PR badges: estimated 1RM PRs, and reps-at-weight only on
bodyweight movements. Schema: `v1PrsSchema`.

```json
{
  "hasMore": false,
  "prs": [
    {
      "exerciseId": "…",
      "exerciseName": "Bench Press",
      "kind": "1rm",
      "value": 245.5,
      "unit": "lb",
      "previousValue": 240,
      "achievedAt": "2026-11-03T22:31:00.000Z",
      "workoutId": "…",
      "tier": "intermediate"
    }
  ]
}
```

- `hasMore`: more PRs fall in the window than `limit`.
- `unit`: the user's weight unit, or `reps` for `reps_at_weight`.
- `previousValue`: the best before this one, or null for the first.
- `tier`: the strength-standard tier of a 1RM on a lift with standards (squat, bench press,
  deadlift, overhead press), judged at today's bodyweight, when the profile has sex and
  bodyweight. Otherwise null.

### `GET /v1/lifts?exercises=<id,…>&from=&to=`

The estimated-1RM trend per lift, from the same code as `exercise_history` and the app's analysis
chart. Schema: `v1LiftsSchema`.

```json
{
  "units": "lb",
  "selection": "most_trained",
  "lifts": [
    {
      "exerciseId": "…",
      "name": "Squat",
      "points": [{ "date": "2026-10-28", "e1rm": 312.5 }, { "date": "2026-11-02", "e1rm": 318 }],
      "current": 318,
      "best": 318,
      "predicted": { "value": 321.4, "confidence": "medium", "trendPerWeek": 2.1 }
    }
  ]
}
```

- `exercises`: up to 10 exercise ids, comma separated. An unknown id is a `404`.
- Without `exercises`, `selection` says how lifts were picked: `dpr` (the PRP block's focus lifts,
  while one is running) or `most_trained` (the 4 strength lifts with the most working sets in the
  last 8 weeks).
- `from`/`to`: default the last 180 days; at most a year apart.
- `points`: the best estimated 1RM per day in the user's zone, oldest first. `current` is the last
  point and `best` the highest. `predicted` is the predicted 1RM now (null without enough history).

### `GET /v1/body-measurements?kinds=bodyweight,body_fat,…&from=&to=`

Measurements over time, from the same code as `get_body_measurements`. Defaults: `bodyweight`,
the last 90 days. Kinds: `bodyweight`, `body_fat`, `neck`, `chest`, `waist`, `hips`, `arms`, `thighs`,
`calves` (`MEASUREMENT_KINDS`); an unknown one is a `400`.
Schema: `v1BodyMeasurementsSchema`.

```json
{
  "measurements": [
    {
      "kind": "bodyweight",
      "unit": "lb",
      "latest": { "value": 181.2, "measuredAt": "2026-11-04T13:00:00.000Z" },
      "change": -2.4,
      "points": [{ "value": 183.6, "measuredAt": "2026-08-07T13:00:00.000Z" }]
    }
  ]
}
```

- Values are converted to the user's units whatever they were entered in: weight in `lb`/`kg`,
  lengths in `in` (lb users) or `cm` (kg users), body fat in `pct`.
- Every requested kind is listed. One with nothing in range has `latest: null`, `change: null`,
  `points: []`.

### `GET /v1/plan?days=1..14`

What's planned, for display: Jackson OS links to Jim rather than starting anything. Schema:
`v1PlanSchema`.

```json
{
  "scheduled": [
    {
      "date": "2026-11-06",
      "routineId": "…",
      "routineName": "Legs",
      "exerciseCount": 6,
      "programName": "PPL",
      "notes": null,
      "webPath": "/routines/…"
    }
  ],
  "next": {
    "routineId": "…",
    "routineName": "Pull B",
    "exerciseCount": 5,
    "programName": "PPL",
    "date": null,
    "reason": "sequence",
    "doneToday": false,
    "webPath": "/routines/…"
  }
}
```

- `scheduled`: workouts planned with `schedule_workout` from today through `days` days ahead
  (default 7), soonest first. `programName` is the active program's when the routine is part of
  it, else null.
- `webPath`: the routine in Jim (`/routines/<id>`). Prefix it with Jim's web origin.
- `next`: the active program's next workout, picked the same way as the Workout tab's Up next card,
  in the user's zone; null with no active program. `date` is set for weekly programs (and a
  sequence resuming after a rest day). `reason` is `sequence`, `rest`, `scheduled-today` or
  `next-scheduled`.

### `GET /v1/dpr`

PR Progression (PRP), from the same code as `dpr_status`. Schema: `v1DprSchema`.

```json
{
  "enabled": true,
  "units": "lb",
  "block": {
    "status": "active",
    "startedAt": "2026-10-13T00:00:00.000Z",
    "endsAt": "2026-12-08T00:00:00.000Z",
    "week": 4,
    "weeks": 8,
    "ended": false
  },
  "lifts": [
    {
      "exerciseId": "…",
      "name": "Squat",
      "next": { "call": "increase", "weight": 275, "reps": 5, "rpe": 8, "reason": "…" },
      "e1rm": { "baseline": 300, "current": 318, "goal": 330 },
      "status": "on_track",
      "lastDecision": { "after": "2026-11-02T23:00:00.000Z", "call": "increase", "weight": 270 }
    }
  ]
}
```

- `block` is null with no block; `week` is the current week, 1-based. `status` is `active`,
  `deload` (show it as a deload week) or `completed`.
- `status` is how the lift tracks against its goal: `ahead`, `on_track` or `behind`, or null.
- `next.call` is `increase`, `hold`, `deload`, `reenter`, `light` or `insufficient`; treat it as
  open-ended.
