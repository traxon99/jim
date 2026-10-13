-- friend_workouts (0031) counting working sets only (issue #494): warm-up
-- sets no longer inflate a friend's set count or set their top weight. Same
-- signature and return type, so it's replaced in place and keeps its grants.
CREATE OR REPLACE FUNCTION public.friend_workouts(p_limit integer DEFAULT 30)
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  username text,
  avatar text,
  units text,
  name text,
  started_at timestamptz,
  ended_at timestamptz,
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
    ORDER BY s.started_at DESC
    LIMIT least(greatest(coalesce(p_limit, 30), 1), 100)
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
    CASE WHEN NOT u.share_workout_details THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', e.name,
          'sets', agg.set_count,
          'topWeight', agg.top_weight,
          'topReps', agg.top_reps
        )
        ORDER BY se.position, se.id
      )
      FROM session_exercises se
      JOIN exercises e ON e.id = se.exercise_id
      CROSS JOIN LATERAL (
        SELECT
          count(*) AS set_count,
          (array_agg(cs.weight ORDER BY cs.weight DESC NULLS LAST, cs.reps DESC NULLS LAST))[1] AS top_weight,
          (array_agg(cs.reps ORDER BY cs.weight DESC NULLS LAST, cs.reps DESC NULLS LAST))[1] AS top_reps
        FROM sets cs
        WHERE cs.session_exercise_id = se.id
          AND cs.deleted_at IS NULL
          AND cs.kind <> 'warmup'
          AND NOT EXISTS (SELECT 1 FROM sets newer WHERE newer.supersedes_id = cs.id)
      ) agg
      WHERE se.session_id = r.id AND se.deleted_at IS NULL AND agg.set_count > 0
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
