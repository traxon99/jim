-- Activity sheet grouped by post (#818): list_activity also returns the
-- comment text, the workout's time and routine icon, the post's kind and
-- title, and whether the row is newer than the last time the bell was opened.
-- Hand-authored like 0069; the return type changes, so drop and recreate.

DROP FUNCTION IF EXISTS public.list_activity(integer);
--> statement-breakpoint
CREATE FUNCTION public.list_activity(p_limit integer DEFAULT 50)
RETURNS TABLE (
  activity_id text,
  kind text,
  occurred_at timestamptz,
  actor_user_id uuid,
  actor_username text,
  actor_avatar text,
  session_id uuid,
  session_name text,
  post_id uuid,
  comment_id uuid,
  reaction_kind text,
  comment_body text,
  session_started_at timestamptz,
  session_ended_at timestamptz,
  routine_icon_shape text,
  routine_icon_color text,
  post_kind text,
  post_title text,
  post_detail text,
  is_new boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH me AS (
    SELECT id, last_seen_activity_at FROM users WHERE id = auth.uid()
  ),
  combined AS (
    SELECT
      'wr:' || r.session_id::text || ':' || r.user_id::text || ':' || r.kind::text AS activity_id,
      'workout_reaction'::text AS kind,
      r.created_at AS occurred_at,
      r.user_id AS actor_user_id,
      r.session_id AS session_id,
      (
        SELECT p.id FROM posts p
        WHERE p.user_id = s.user_id AND p.session_id = s.id AND p.kind = 'workout'
        ORDER BY p.created_at DESC
        LIMIT 1
      ) AS post_id,
      NULL::uuid AS comment_id,
      r.kind::text AS reaction_kind,
      NULL::text AS comment_body
    FROM workout_reactions r
    JOIN sessions s ON s.id = r.session_id
    WHERE s.user_id = auth.uid()
      AND s.deleted_at IS NULL
      AND r.user_id <> auth.uid()

    UNION ALL

    SELECT
      'fr:' || f.id::text,
      'friend_request'::text,
      f.created_at,
      f.requester_id,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::text,
      NULL::text
    FROM friendships f
    WHERE f.addressee_id = auth.uid() AND f.status = 'pending'

    UNION ALL

    SELECT
      'pr:' || pr.post_id::text || ':' || pr.user_id::text || ':' || pr.kind::text,
      'post_reaction'::text,
      pr.created_at,
      pr.user_id,
      p.session_id,
      p.id,
      NULL::uuid,
      pr.kind::text,
      NULL::text
    FROM post_reactions pr
    JOIN posts p ON p.id = pr.post_id
    WHERE p.user_id = auth.uid() AND pr.user_id <> auth.uid()

    UNION ALL

    SELECT
      'cm:' || c.id::text,
      'comment'::text,
      c.created_at,
      c.user_id,
      c.session_id,
      c.post_id,
      c.id,
      NULL::text,
      c.body
    FROM comments c
    WHERE c.deleted_at IS NULL
      AND c.user_id <> auth.uid()
      AND (
        EXISTS (
          SELECT 1 FROM sessions s
          WHERE s.id = c.session_id AND s.user_id = auth.uid() AND s.deleted_at IS NULL
        )
        OR EXISTS (SELECT 1 FROM posts p WHERE p.id = c.post_id AND p.user_id = auth.uid())
      )
  )
  SELECT
    a.activity_id,
    a.kind,
    a.occurred_at,
    u.id,
    u.username,
    u.avatar,
    a.session_id,
    s.name,
    a.post_id,
    a.comment_id,
    a.reaction_kind,
    a.comment_body,
    s.started_at,
    s.ended_at,
    rt.icon_shape::text,
    rt.icon_color::text,
    p.kind::text,
    p.title,
    p.detail,
    a.occurred_at > coalesce((SELECT last_seen_activity_at FROM me), '-infinity'::timestamptz)
  FROM combined a
  JOIN users u ON u.id = a.actor_user_id
  LEFT JOIN sessions s ON s.id = a.session_id
  LEFT JOIN routines rt ON rt.id = s.routine_id
  LEFT JOIN posts p ON p.id = a.post_id
  ORDER BY a.occurred_at DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_activity(integer) FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.list_activity(integer) FROM anon;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.list_activity(integer) TO authenticated;
