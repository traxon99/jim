-- Comments on workouts and posts (issue #749). Hand-authored like 0025 and
-- 0031: drizzle-kit can't express functions, so don't regenerate over this
-- file. Same rule too (ADR-017): `comments` and `comment_reactions` have no
-- write policies, and a thread is only ever read and written through these
-- SECURITY DEFINER functions, which act for auth.uid() alone.
--
-- Who can see and write a thread: the owner of the workout or post, and
-- their accepted friends. A workout must be finished and undeleted; a post's
-- linked workout must be undeleted.

-- The owner of the workout or post a comment thread hangs off, when the
-- current user may see it; null otherwise. Exactly one of the two ids is set.
CREATE FUNCTION public.comment_target_owner(p_session_id uuid, p_post_id uuid) RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH target AS (
    SELECT s.user_id AS owner_id
    FROM sessions s
    WHERE p_post_id IS NULL AND s.id = p_session_id
      AND s.ended_at IS NOT NULL AND s.deleted_at IS NULL
    UNION ALL
    SELECT p.user_id
    FROM posts p
    LEFT JOIN sessions s ON s.id = p.session_id
    WHERE p_session_id IS NULL AND p.id = p_post_id
      AND (p.session_id IS NULL OR s.deleted_at IS NULL)
  )
  SELECT t.owner_id
  FROM target t
  WHERE auth.uid() IS NOT NULL AND (
    t.owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM friendships f
      WHERE f.status = 'accepted'
        AND least(f.requester_id, f.addressee_id) = least(auth.uid(), t.owner_id)
        AND greatest(f.requester_id, f.addressee_id) = greatest(auth.uid(), t.owner_id)
    )
  )
  LIMIT 1
$$;
--> statement-breakpoint
-- Adds the current user's comment. The text is checked again here, whatever
-- the API already checked (@jim/core's commentError; 500 is its
-- COMMENT_MAX_LENGTH). Returns the new
-- comment's id, or null when the thread isn't one they can see.
CREATE FUNCTION public.add_comment(p_session_id uuid, p_post_id uuid, p_body text) RETURNS uuid
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
  IF num_nonnulls(p_session_id, p_post_id) <> 1
     OR coalesce(length(btrim(p_body)), 0) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid comment' USING ERRCODE = '22023';
  END IF;
  IF comment_target_owner(p_session_id, p_post_id) IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO comments (user_id, session_id, post_id, body)
  VALUES (me, p_session_id, p_post_id, btrim(p_body))
  RETURNING id INTO new_id;
  RETURN new_id;
END
$$;
--> statement-breakpoint
-- Deletes a comment: its author can, and so can the owner of the workout or
-- post it's on. False when there's no such comment or it isn't theirs to delete.
CREATE FUNCTION public.delete_comment(p_comment_id uuid) RETURNS boolean
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
  UPDATE comments c SET deleted_at = now()
  WHERE c.id = p_comment_id AND c.deleted_at IS NULL AND (
    c.user_id = me
    OR EXISTS (SELECT 1 FROM sessions s WHERE s.id = c.session_id AND s.user_id = me)
    OR EXISTS (SELECT 1 FROM posts p WHERE p.id = c.post_id AND p.user_id = me)
  );
  RETURN FOUND;
END
$$;
--> statement-breakpoint
-- A workout's or post's comments, oldest first, with each author, whether
-- the current user wrote it or may delete it, and its reactions.
CREATE FUNCTION public.list_comments(p_session_id uuid, p_post_id uuid)
RETURNS TABLE (
  comment_id uuid,
  user_id uuid,
  username text,
  avatar text,
  body text,
  created_at timestamptz,
  mine boolean,
  can_delete boolean,
  reactions jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH owner AS (SELECT comment_target_owner(p_session_id, p_post_id) AS id)
  SELECT
    c.id,
    c.user_id,
    u.username,
    u.avatar,
    c.body,
    c.created_at,
    c.user_id = auth.uid(),
    c.user_id = auth.uid() OR o.id = auth.uid(),
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('kind', cr.kind, 'count', cr.n, 'mine', cr.mine)
        ORDER BY cr.kind
      )
      FROM (
        SELECT kind, count(*) AS n, bool_or(r.user_id = auth.uid()) AS mine
        FROM comment_reactions r
        WHERE r.comment_id = c.id
        GROUP BY kind
      ) cr
    ), '[]'::jsonb)
  FROM owner o
  JOIN comments c ON c.deleted_at IS NULL
    AND (c.session_id = p_session_id OR c.post_id = p_post_id)
  JOIN users u ON u.id = c.user_id
  WHERE o.id IS NOT NULL
  ORDER BY c.created_at, c.id
  LIMIT 500
$$;
--> statement-breakpoint
-- Sets the current user's reaction on a comment they can see: one per person,
-- so a new kind replaces theirs and the same kind takes it back. True when
-- the reaction is now there, false when it was removed, null when the
-- comment isn't one they can see.
CREATE FUNCTION public.set_comment_reaction(p_comment_id uuid, p_kind reaction_kind) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  target comments%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO target FROM comments WHERE id = p_comment_id AND deleted_at IS NULL;
  IF NOT FOUND OR comment_target_owner(target.session_id, target.post_id) IS NULL THEN
    RETURN NULL;
  END IF;
  DELETE FROM comment_reactions
  WHERE comment_id = p_comment_id AND user_id = me AND kind = p_kind;
  IF FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO comment_reactions (comment_id, user_id, kind) VALUES (p_comment_id, me, p_kind)
  ON CONFLICT (comment_id, user_id) DO UPDATE SET kind = EXCLUDED.kind, created_at = now();
  RETURN true;
END
$$;
--> statement-breakpoint
-- For the feed: each listed workout's and post's comment count and newest
-- comment, for the ones the current user can see.
CREATE FUNCTION public.comment_summaries(p_session_ids uuid[], p_post_ids uuid[])
RETURNS TABLE (
  session_id uuid,
  post_id uuid,
  comment_count integer,
  latest_username text,
  latest_body text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH targets AS (
    SELECT t.id AS session_id, NULL::uuid AS post_id
    FROM unnest(coalesce(p_session_ids, '{}')) AS t(id)
    UNION
    SELECT NULL::uuid, t.id
    FROM unnest(coalesce(p_post_ids, '{}')) AS t(id)
  ),
  visible AS (
    SELECT * FROM targets t
    WHERE comment_target_owner(t.session_id, t.post_id) IS NOT NULL
    LIMIT 200
  )
  SELECT
    v.session_id,
    v.post_id,
    agg.n::integer,
    latest.username,
    latest.body
  FROM visible v
  CROSS JOIN LATERAL (
    SELECT count(*) AS n FROM comments c
    WHERE c.deleted_at IS NULL
      AND (c.session_id = v.session_id OR c.post_id = v.post_id)
  ) agg
  LEFT JOIN LATERAL (
    SELECT u.username, c.body FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.deleted_at IS NULL
      AND (c.session_id = v.session_id OR c.post_id = v.post_id)
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT 1
  ) latest ON true
  WHERE agg.n > 0
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.comment_target_owner(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.add_comment(uuid, uuid, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_comment(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_comments(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.set_comment_reaction(uuid, reaction_kind) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.comment_summaries(uuid[], uuid[]) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.comment_target_owner(uuid, uuid) FROM anon;
  REVOKE ALL ON FUNCTION public.add_comment(uuid, uuid, text) FROM anon;
  REVOKE ALL ON FUNCTION public.delete_comment(uuid) FROM anon;
  REVOKE ALL ON FUNCTION public.list_comments(uuid, uuid) FROM anon;
  REVOKE ALL ON FUNCTION public.set_comment_reaction(uuid, reaction_kind) FROM anon;
  REVOKE ALL ON FUNCTION public.comment_summaries(uuid[], uuid[]) FROM anon;
END
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.comment_target_owner(uuid, uuid) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.add_comment(uuid, uuid, text) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_comment(uuid) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.list_comments(uuid, uuid) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.set_comment_reaction(uuid, reaction_kind) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.comment_summaries(uuid[], uuid[]) TO authenticated;
