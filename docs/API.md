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
