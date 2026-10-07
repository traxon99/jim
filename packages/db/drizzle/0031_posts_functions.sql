-- Profile pictures, posts and sharing settings (issue #316). Hand-authored
-- for the same reason as 0023 and 0025: drizzle-kit can't express functions,
-- so don't regenerate over this file. Same rule too (ADR-017): `posts` has no
-- write policies, and a friend only ever sees a user's posts, picture and
-- workouts through these SECURITY DEFINER functions, which act for
-- auth.uid() alone and check the friendship themselves.

-- Shares something with the current user's friends. A "workout" post links
-- `p_session_id`, which must be the user's own finished, undeleted workout;
-- the other kinds link nothing. The text is checked again here, whatever the
-- API already checked (@jim/core's postDraftError). Returns the new post's id.
CREATE FUNCTION public.create_post(
  p_kind post_kind,
  p_session_id uuid,
  p_title text,
  p_detail text,
  p_caption text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  new_id uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF coalesce(length(p_title), 0) NOT BETWEEN 1 AND 80
     OR coalesce(length(p_detail), 0) > 200
     OR coalesce(length(p_caption), 0) > 280 THEN
    RAISE EXCEPTION 'invalid post' USING ERRCODE = '22023';
  END IF;
  IF (p_kind = 'workout') <> (p_session_id IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid post' USING ERRCODE = '22023';
  END IF;
  IF p_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sessions
    WHERE id = p_session_id AND user_id = me AND ended_at IS NOT NULL AND deleted_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;
  INSERT INTO posts (user_id, kind, session_id, title, detail, caption)
  VALUES (me, p_kind, p_session_id, p_title, p_detail, p_caption)
  RETURNING id INTO new_id;
  RETURN new_id;
END
$$;
--> statement-breakpoint
-- Deletes one of the current user's own posts. False when there's no such post.
CREATE FUNCTION public.delete_post(p_post_id uuid) RETURNS boolean
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
  DELETE FROM posts WHERE id = p_post_id AND user_id = me;
  RETURN FOUND;
END
$$;
--> statement-breakpoint
-- Accepted friends' posts, newest first, with each author's username and
-- picture. A workout post whose workout has since been deleted drops out.
-- Workout posts carry that workout's reactions (the same shape as
-- friend_workouts), so they can be reacted to; the other kinds carry none.
CREATE FUNCTION public.friend_posts(p_limit integer DEFAULT 30)
RETURNS TABLE (
  post_id uuid,
  user_id uuid,
  username text,
  avatar text,
  kind text,
  session_id uuid,
  title text,
  detail text,
  caption text,
  created_at timestamptz,
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
  )
  SELECT
    p.id,
    p.user_id,
    u.username,
    u.avatar,
    p.kind::text,
    p.session_id,
    p.title,
    p.detail,
    p.caption,
    p.created_at,
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('kind', wr.kind, 'count', wr.n, 'mine', wr.mine)
        ORDER BY wr.kind
      )
      FROM (
        SELECT kind, count(*) AS n, bool_or(user_id = auth.uid()) AS mine
        FROM workout_reactions
        WHERE session_id = p.session_id
        GROUP BY kind
      ) wr
    ), '[]'::jsonb)
  FROM posts p
  JOIN friend_ids fi ON fi.id = p.user_id
  JOIN users u ON u.id = p.user_id
  LEFT JOIN sessions s ON s.id = p.session_id
  WHERE p.session_id IS NULL OR s.deleted_at IS NULL
  ORDER BY p.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 30), 1), 100)
$$;
--> statement-breakpoint
-- list_friends (0023) plus each person's picture. Its return type changes, so
-- it's dropped and recreated rather than replaced.
DROP FUNCTION public.list_friends();
--> statement-breakpoint
CREATE FUNCTION public.list_friends()
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar text,
  status text,
  direction text,
  since timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    other.id,
    other.username,
    other.avatar,
    f.status::text,
    CASE
      WHEN f.status = 'accepted' THEN NULL
      WHEN f.requester_id = auth.uid() THEN 'outgoing'
      ELSE 'incoming'
    END,
    coalesce(f.accepted_at, f.created_at)
  FROM friendships f
  JOIN users other
    ON other.id = CASE WHEN f.requester_id = auth.uid() THEN f.addressee_id ELSE f.requester_id END
  WHERE auth.uid() IN (f.requester_id, f.addressee_id)
  ORDER BY other.username
$$;
--> statement-breakpoint
-- friend_workouts (0025) plus each friend's picture, now following their
-- sharing settings: a friend who turned off share_workouts drops out of the
-- feed entirely, and one who turned off share_workout_details shows only the
-- workout's name and time (no exercises). The return type changes, so it's
-- dropped and recreated rather than replaced.
DROP FUNCTION public.friend_workouts(integer);
--> statement-breakpoint
CREATE FUNCTION public.friend_workouts(p_limit integer DEFAULT 30)
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.create_post(post_kind, uuid, text, text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_post(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.friend_posts(integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_friends() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.friend_workouts(integer) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.create_post(post_kind, uuid, text, text, text) FROM anon;
  REVOKE ALL ON FUNCTION public.delete_post(uuid) FROM anon;
  REVOKE ALL ON FUNCTION public.friend_posts(integer) FROM anon;
  REVOKE ALL ON FUNCTION public.list_friends() FROM anon;
  REVOKE ALL ON FUNCTION public.friend_workouts(integer) FROM anon;
END
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_post(post_kind, uuid, text, text, text) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_post(uuid) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.friend_posts(integer) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.list_friends() TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.friend_workouts(integer) TO authenticated;
