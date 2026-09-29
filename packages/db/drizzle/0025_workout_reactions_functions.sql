-- Reactions to friends' workouts (issue #303). Hand-authored for the same
-- reason as 0023: drizzle-kit can't express functions, so don't regenerate
-- over this file. Same rule too (ADR-017): workout_reactions has no write
-- policies, and a session's owner only ever sees its reactions through these
-- SECURITY DEFINER functions, which act for auth.uid() alone.

-- Adds the current user's `p_kind` reaction to `p_session_id`, or takes it
-- back if they'd already left it. True when the reaction is now there, false
-- when it was removed, and null when the session isn't an accepted friend's
-- finished, undeleted workout (so it can't be reacted to).
CREATE FUNCTION public.toggle_workout_reaction(p_session_id uuid, p_kind reaction_kind) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM sessions s
    JOIN friendships f
      ON f.status = 'accepted'
     AND least(f.requester_id, f.addressee_id) = least(me, s.user_id)
     AND greatest(f.requester_id, f.addressee_id) = greatest(me, s.user_id)
    WHERE s.id = p_session_id AND s.ended_at IS NOT NULL AND s.deleted_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;
  DELETE FROM workout_reactions
  WHERE session_id = p_session_id AND user_id = me AND kind = p_kind;
  IF FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO workout_reactions (session_id, user_id, kind) VALUES (p_session_id, me, p_kind);
  RETURN true;
END
$$;
--> statement-breakpoint
-- Reactions others left on the current user's own workouts, newest first,
-- with who reacted and which workout it was.
CREATE FUNCTION public.workout_reactions_received(p_limit integer DEFAULT 20)
RETURNS TABLE (
  session_id uuid,
  session_name text,
  started_at timestamptz,
  user_id uuid,
  username text,
  kind text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.name, s.started_at, u.id, u.username, r.kind::text, r.created_at
  FROM workout_reactions r
  JOIN sessions s ON s.id = r.session_id
  JOIN users u ON u.id = r.user_id
  WHERE s.user_id = auth.uid() AND s.deleted_at IS NULL AND r.user_id <> auth.uid()
  ORDER BY r.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 100)
$$;
--> statement-breakpoint
-- friend_workouts (0023) plus each workout's reactions: per kind, how many
-- people left it and whether the current user is one of them. Its return
-- type changes, so it's dropped and recreated rather than replaced.
DROP FUNCTION public.friend_workouts(integer);
--> statement-breakpoint
CREATE FUNCTION public.friend_workouts(p_limit integer DEFAULT 30)
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  username text,
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
    WHERE s.ended_at IS NOT NULL AND s.deleted_at IS NULL
    ORDER BY s.started_at DESC
    LIMIT least(greatest(coalesce(p_limit, 30), 1), 100)
  )
  SELECT
    r.id,
    r.user_id,
    u.username,
    u.units::text,
    r.name,
    r.started_at,
    r.ended_at,
    coalesce((
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
          AND NOT EXISTS (SELECT 1 FROM sets newer WHERE newer.supersedes_id = cs.id)
      ) agg
      WHERE se.session_id = r.id AND se.deleted_at IS NULL AND agg.set_count > 0
    ), '[]'::jsonb),
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
REVOKE ALL ON FUNCTION public.toggle_workout_reaction(uuid, reaction_kind) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.workout_reactions_received(integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.friend_workouts(integer) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.toggle_workout_reaction(uuid, reaction_kind) FROM anon;
  REVOKE ALL ON FUNCTION public.workout_reactions_received(integer) FROM anon;
  REVOKE ALL ON FUNCTION public.friend_workouts(integer) FROM anon;
END
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.toggle_workout_reaction(uuid, reaction_kind) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.workout_reactions_received(integer) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.friend_workouts(integer) TO authenticated;
