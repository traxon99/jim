-- Full-width feed posts (issue #747). Hand-authored like 0025/0031/0045:
-- drizzle-kit can't express functions, so don't regenerate over this file.
--
-- friend_workouts (0045) plus what a post's media needs: the routine's icon
-- color (the post's tint), the gym's name, working-set volume, the top three
-- muscles by working sets, and the session's PRs. Detail columns stay empty
-- when the friend turned off share_workout_details, like the exercises.
-- `p_friend_id` narrows it to one friend (their profile, issue #751). The
-- return type changes, so it's dropped and recreated rather than replaced.
DROP FUNCTION public.friend_workouts(integer);
--> statement-breakpoint
CREATE FUNCTION public.friend_workouts(p_limit integer DEFAULT 30, p_friend_id uuid DEFAULT NULL)
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  username text,
  avatar text,
  units text,
  name text,
  started_at timestamptz,
  ended_at timestamptz,
  routine_color text,
  gym_name text,
  volume numeric,
  muscles jsonb,
  records jsonb,
  exercises jsonb,
  reactions jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH friend_ids AS (
    SELECT CASE WHEN f.requester_id = auth.uid() THEN f.addressee_id ELSE f.requester_id END AS id
    FROM friendships f
    WHERE f.status = 'accepted' AND auth.uid() IN (f.requester_id, f.addressee_id)
  ),
  recent AS (
    SELECT s.*
    FROM sessions s
    JOIN friend_ids fi ON fi.id = s.user_id
    JOIN users owner ON owner.id = s.user_id AND owner.share_workouts
    WHERE s.ended_at IS NOT NULL AND s.deleted_at IS NULL
      AND (p_friend_id IS NULL OR s.user_id = p_friend_id)
    ORDER BY s.started_at DESC
    LIMIT least(greatest(coalesce(p_limit, 30), 1), 100)
  ),
  -- Each exercise's current working sets (warm-ups and superseded rows left out).
  working AS (
    SELECT se.session_id, se.id AS session_exercise_id, se.position, e.id AS exercise_id,
           e.name, e.primary_muscles, e.tracking_type, cs.id AS set_id, cs.weight, cs.reps
    FROM recent r
    JOIN session_exercises se ON se.session_id = r.id AND se.deleted_at IS NULL
    JOIN exercises e ON e.id = se.exercise_id
    JOIN sets cs ON cs.session_exercise_id = se.id
    WHERE cs.deleted_at IS NULL
      AND cs.kind <> 'warmup'
      AND NOT EXISTS (SELECT 1 FROM sets newer WHERE newer.supersedes_id = cs.id)
  )
  SELECT
    r.id,
    r.user_id,
    u.username,
    u.avatar,
    u.units::text,
    r.name,
    r.started_at,
    r.ended_at,
    (SELECT ro.icon_color::text FROM routines ro WHERE ro.id = r.routine_id AND ro.deleted_at IS NULL),
    (SELECT g.name FROM gyms g WHERE g.id = r.gym_id AND g.deleted_at IS NULL),
    CASE WHEN NOT u.share_workout_details THEN NULL ELSE coalesce((
      SELECT sum(w.weight * w.reps) FROM working w
      WHERE w.session_id = r.id AND w.weight IS NOT NULL AND w.reps IS NOT NULL
    ), 0) END,
    CASE WHEN NOT u.share_workout_details THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object('muscle', m.muscle, 'sets', m.n) ORDER BY m.n DESC, m.muscle)
      FROM (
        SELECT muscle::text AS muscle, count(*) AS n
        FROM working w CROSS JOIN LATERAL unnest(w.primary_muscles) AS muscle
        WHERE w.session_id = r.id
        GROUP BY muscle
        ORDER BY n DESC, muscle
        LIMIT 3
      ) m
    ), '[]'::jsonb) END,
    -- The PRs shown outside the PR page (@jim/core's isVisiblePr): estimated
    -- 1RM, and reps at a weight on bodyweight exercises only.
    CASE WHEN NOT u.share_workout_details THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'exercise', w.name,
          'kind', pr.kind,
          'value', pr.value,
          'weight', w.weight,
          'reps', w.reps
        )
        ORDER BY w.position, pr.kind
      )
      FROM working w
      JOIN personal_records pr ON pr.set_id = w.set_id AND pr.deleted_at IS NULL
      WHERE w.session_id = r.id
        AND (pr.kind = '1rm'
          OR (pr.kind = 'reps_at_weight' AND w.tracking_type IN ('bodyweight', 'weighted_bodyweight')))
    ), '[]'::jsonb) END,
    CASE WHEN NOT u.share_workout_details THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', agg.name,
          'sets', agg.set_count,
          'topWeight', agg.top_weight,
          'topReps', agg.top_reps
        )
        ORDER BY agg.position, agg.session_exercise_id
      )
      FROM (
        SELECT
          w.session_exercise_id,
          w.position,
          w.name,
          count(*) AS set_count,
          (array_agg(w.weight ORDER BY w.weight DESC NULLS LAST, w.reps DESC NULLS LAST))[1] AS top_weight,
          (array_agg(w.reps ORDER BY w.weight DESC NULLS LAST, w.reps DESC NULLS LAST))[1] AS top_reps
        FROM working w
        WHERE w.session_id = r.id
        GROUP BY w.session_exercise_id, w.position, w.name
      ) agg
    ), '[]'::jsonb) END,
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('kind', wr.kind, 'count', wr.n, 'mine', wr.mine)
        ORDER BY wr.kind
      )
      FROM (
        SELECT kind, count(*) AS n, bool_or(user_id = auth.uid()) AS mine
        FROM workout_reactions
        WHERE session_id = r.id
        GROUP BY kind
      ) wr
    ), '[]'::jsonb)
  FROM recent r
  JOIN users u ON u.id = r.user_id
  ORDER BY r.started_at DESC
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.friend_workouts(integer, uuid) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.friend_workouts(integer, uuid) FROM anon;
END
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.friend_workouts(integer, uuid) TO authenticated;
