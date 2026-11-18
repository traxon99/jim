ALTER TABLE "users" ADD COLUMN "share_leaderboards" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "share_relative_strength" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Friend leaderboards (issue #837). Hand-authored like 0023/0061: SECURITY
-- DEFINER functions that act for auth.uid() only and check the friendship
-- themselves (ADR-017), so nothing about a friend reaches IndexedDB.
--
-- Values come from personal_records, the same derived cache the PR page reads
-- (docs/ARCHITECTURE.md §4): the best e1RM is the max live '1rm' row, the best
-- set the max live 'weight' row joined to its set's reps. Like the PR page, a
-- row set in a deleted workout or a removed exercise doesn't count.
--
-- Matching is by exercise slug, which a copy-on-write clone keeps (ADR-008).
-- A machine exercise (issue #450) only matches the same slug, make and model
-- (case-insensitive) at a pinned gym within 150 m: gyms are per-user rows, so
-- a nearby pin is the only cross-user "same gym". `p_machine` is
-- {"brand","model","latitude","longitude"}; null means "no machine details".
--
-- A participant is the caller (always) or an accepted friend who has both
-- share_leaderboards and share_workouts on. relative_strength is the best e1RM
-- over the bodyweight logged on or before it was set, both in kg and rounded
-- to 2 places; it is null unless that user shares it (the caller always sees
-- their own). The bodyweight itself is never returned.

CREATE FUNCTION public.friend_lift_leaderboard(p_slug text, p_machine jsonb DEFAULT NULL)
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar text,
  is_me boolean,
  units text,
  best_e1rm numeric,
  best_e1rm_at timestamptz,
  best_weight numeric,
  best_weight_reps integer,
  best_weight_at timestamptz,
  relative_strength numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH participants AS (
    SELECT u.id, u.username, u.avatar, u.units, u.share_relative_strength,
           (u.id = auth.uid()) AS is_me
    FROM users u
    WHERE u.id = auth.uid()
      OR (
        u.share_leaderboards
        AND u.share_workouts
        AND EXISTS (
          SELECT 1
          FROM friendships f
          WHERE f.status = 'accepted'
            AND auth.uid() IN (f.requester_id, f.addressee_id)
            AND u.id IN (f.requester_id, f.addressee_id)
        )
      )
  ),
  cand AS (
    SELECT pr.user_id, pr.kind::text AS kind, pr.value, pr.set_id, pr.achieved_at
    FROM participants p
    JOIN personal_records pr
      ON pr.user_id = p.id
     AND pr.deleted_at IS NULL
     AND pr.kind IN ('1rm', 'weight')
    JOIN exercises e ON e.id = pr.exercise_id
    LEFT JOIN gyms g ON g.id = e.gym_id AND g.deleted_at IS NULL
    WHERE e.slug = p_slug
      AND e.category = 'strength'
      AND e.tracking_type = 'weight_reps'
      AND NOT EXISTS (
        SELECT 1
        FROM sets s
        JOIN session_exercises se ON se.id = s.session_exercise_id
        JOIN sessions ss ON ss.id = se.session_id
        WHERE s.id = pr.set_id
          AND (se.deleted_at IS NOT NULL OR ss.deleted_at IS NOT NULL)
      )
      AND CASE
        WHEN p_machine IS NULL THEN
          nullif(btrim(e.machine_brand), '') IS NULL
          AND nullif(btrim(e.machine_model), '') IS NULL
        ELSE
          nullif(lower(btrim(e.machine_brand)), '') = nullif(lower(btrim(p_machine ->> 'brand')), '')
          AND nullif(lower(btrim(e.machine_model)), '') = nullif(lower(btrim(p_machine ->> 'model')), '')
          AND g.latitude IS NOT NULL
          AND g.longitude IS NOT NULL
          AND 6371000 * 2 * asin(sqrt(least(1,
                power(sin(radians(g.latitude - (p_machine ->> 'latitude')::double precision) / 2), 2)
                + cos(radians((p_machine ->> 'latitude')::double precision))
                  * cos(radians(g.latitude))
                  * power(sin(radians(g.longitude - (p_machine ->> 'longitude')::double precision) / 2), 2)
              ))) <= 150
      END
  ),
  best_e1rm AS (
    SELECT DISTINCT ON (c.user_id) c.user_id, c.value, c.achieved_at
    FROM cand c
    WHERE c.kind = '1rm'
    ORDER BY c.user_id, c.value DESC, c.achieved_at ASC
  ),
  best_weight AS (
    SELECT DISTINCT ON (c.user_id) c.user_id, c.value, s.reps, c.achieved_at
    FROM cand c
    LEFT JOIN sets s ON s.id = c.set_id
    WHERE c.kind = 'weight'
    ORDER BY c.user_id, c.value DESC, c.achieved_at ASC
  )
  SELECT
    p.id,
    p.username,
    p.avatar,
    p.is_me,
    p.units::text,
    e1.value,
    e1.achieved_at,
    w.value,
    w.reps,
    w.achieved_at,
    CASE WHEN e1.value IS NOT NULL AND (p.is_me OR p.share_relative_strength) THEN (
      SELECT round(
        (e1.value / CASE p.units WHEN 'lb' THEN 2.20462262 ELSE 1 END)
        / (bw.value / CASE bw.unit WHEN 'lb' THEN 2.20462262 ELSE 1 END),
        2
      )
      FROM body_measurements bw
      WHERE bw.user_id = p.id
        AND bw.kind = 'bodyweight'
        AND bw.deleted_at IS NULL
        AND bw.unit IN ('lb', 'kg')
        AND bw.value > 0
        AND bw.measured_at <= e1.achieved_at
      ORDER BY bw.measured_at DESC
      LIMIT 1
    ) END
  FROM participants p
  LEFT JOIN best_e1rm e1 ON e1.user_id = p.id
  LEFT JOIN best_weight w ON w.user_id = p.id
  WHERE e1.user_id IS NOT NULL OR w.user_id IS NOT NULL
  ORDER BY p.is_me DESC, p.username
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.friend_lift_leaderboard(text, jsonb) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.friend_lift_leaderboard(text, jsonb) FROM anon;
END
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.friend_lift_leaderboard(text, jsonb) TO authenticated;
--> statement-breakpoint
-- The lifts the caller and at least one eligible friend both have a live PR
-- on, busiest first. A machine exercise needs make, model and a pinned gym to
-- be listed; one that lacks them is left off (the app says why).
CREATE FUNCTION public.friend_leaderboard_lifts()
RETURNS TABLE (
  slug text,
  name text,
  machine jsonb,
  participants integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH mine AS (
    SELECT k.slug, min(k.name) AS name, k.machine
    FROM (
      SELECT
        e.slug,
        e.name,
        CASE
          WHEN nullif(btrim(e.machine_brand), '') IS NULL
            AND nullif(btrim(e.machine_model), '') IS NULL THEN NULL
          ELSE jsonb_build_object(
            'brand', btrim(e.machine_brand),
            'model', btrim(e.machine_model),
            'latitude', g.latitude,
            'longitude', g.longitude
          )
        END AS machine
      FROM personal_records pr
      JOIN exercises e ON e.id = pr.exercise_id
      LEFT JOIN gyms g ON g.id = e.gym_id AND g.deleted_at IS NULL
      WHERE pr.user_id = auth.uid()
        AND pr.deleted_at IS NULL
        AND pr.kind = '1rm'
        AND e.category = 'strength'
        AND e.tracking_type = 'weight_reps'
        AND (
          (nullif(btrim(e.machine_brand), '') IS NULL AND nullif(btrim(e.machine_model), '') IS NULL)
          OR (
            nullif(btrim(e.machine_brand), '') IS NOT NULL
            AND nullif(btrim(e.machine_model), '') IS NOT NULL
            AND g.latitude IS NOT NULL
            AND g.longitude IS NOT NULL
          )
        )
    ) k
    GROUP BY k.slug, k.machine
  )
  SELECT m.slug, m.name, m.machine, count(*)::integer
  FROM mine m
  CROSS JOIN LATERAL public.friend_lift_leaderboard(m.slug, m.machine) lb
  GROUP BY m.slug, m.name, m.machine
  HAVING bool_or(lb.is_me) AND count(*) > 1
  ORDER BY count(*) DESC, m.name
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.friend_leaderboard_lifts() FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.friend_leaderboard_lifts() FROM anon;
END
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.friend_leaderboard_lifts() TO authenticated;
