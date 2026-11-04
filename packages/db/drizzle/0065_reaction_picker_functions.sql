-- Reaction picker on the feed (issue #748). Hand-authored like 0025/0063:
-- drizzle-kit can't express functions, so don't regenerate over this file.

-- One reaction per person on a friend's workout: same kind removes, another
-- replaces. Null when the session isn't an accepted friend's finished workout.
CREATE OR REPLACE FUNCTION public.toggle_workout_reaction(p_session_id uuid, p_kind reaction_kind) RETURNS boolean
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
  INSERT INTO workout_reactions (session_id, user_id, kind) VALUES (p_session_id, me, p_kind)
  ON CONFLICT (session_id, user_id) DO UPDATE SET kind = EXCLUDED.kind, created_at = now();
  RETURN true;
END
$$;
--> statement-breakpoint
-- Record and achievement posts only; workout posts react through their session.
CREATE FUNCTION public.toggle_post_reaction(p_post_id uuid, p_kind reaction_kind) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  owner uuid;
  linked uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT p.user_id, p.session_id INTO owner, linked
  FROM posts p
  LEFT JOIN sessions s ON s.id = p.session_id
  WHERE p.id = p_post_id AND (p.session_id IS NULL OR s.deleted_at IS NULL);
  IF NOT FOUND OR linked IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM friendships f
    WHERE f.status = 'accepted'
      AND least(f.requester_id, f.addressee_id) = least(me, owner)
      AND greatest(f.requester_id, f.addressee_id) = greatest(me, owner)
  ) THEN
    RETURN NULL;
  END IF;
  DELETE FROM post_reactions
  WHERE post_id = p_post_id AND user_id = me AND kind = p_kind;
  IF FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO post_reactions (post_id, user_id, kind) VALUES (p_post_id, me, p_kind)
  ON CONFLICT (post_id, user_id) DO UPDATE SET kind = EXCLUDED.kind, created_at = now();
  RETURN true;
END
$$;
--> statement-breakpoint
-- Up to two other reactors' usernames per workout or post, newest first.
CREATE FUNCTION public.reaction_names(p_session_ids uuid[], p_post_ids uuid[])
RETURNS TABLE (
  session_id uuid,
  post_id uuid,
  names text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT t.id, NULL::uuid, sub.names
  FROM unnest(coalesce(p_session_ids, '{}')) AS t(id)
  CROSS JOIN LATERAL (
    SELECT coalesce(array_agg(u.username ORDER BY r.created_at DESC), '{}') AS names
    FROM (
      SELECT wr.user_id, wr.created_at
      FROM workout_reactions wr
      WHERE wr.session_id = t.id AND wr.user_id <> auth.uid()
      ORDER BY wr.created_at DESC
      LIMIT 2
    ) r
    JOIN users u ON u.id = r.user_id
  ) sub
  UNION ALL
  SELECT NULL::uuid, t.id, sub.names
  FROM unnest(coalesce(p_post_ids, '{}')) AS t(id)
  CROSS JOIN LATERAL (
    SELECT coalesce(array_agg(u.username ORDER BY r.created_at DESC), '{}') AS names
    FROM (
      SELECT pr.user_id, pr.created_at
      FROM post_reactions pr
      WHERE pr.post_id = t.id AND pr.user_id <> auth.uid()
      ORDER BY pr.created_at DESC
      LIMIT 2
    ) r
    JOIN users u ON u.id = r.user_id
  ) sub
$$;
--> statement-breakpoint
-- friend_posts (0031) with each post's own reactions: workout posts carry
-- their session's; record and achievement posts carry post_reactions.
DROP FUNCTION public.friend_posts(integer);
--> statement-breakpoint
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
        jsonb_build_object('kind', agg.kind, 'count', agg.n, 'mine', agg.mine)
        ORDER BY agg.kind
      )
      FROM (
        SELECT kind, count(*) AS n, bool_or(user_id = auth.uid()) AS mine
        FROM workout_reactions
        WHERE session_id = p.session_id AND p.session_id IS NOT NULL
        GROUP BY kind
        UNION ALL
        SELECT kind, count(*) AS n, bool_or(user_id = auth.uid()) AS mine
        FROM post_reactions
        WHERE post_id = p.id AND p.session_id IS NULL
        GROUP BY kind
      ) agg
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
REVOKE ALL ON FUNCTION public.toggle_post_reaction(uuid, reaction_kind) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reaction_names(uuid[], uuid[]) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.toggle_post_reaction(uuid, reaction_kind) FROM anon;
  REVOKE ALL ON FUNCTION public.reaction_names(uuid[], uuid[]) FROM anon;
END
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.toggle_post_reaction(uuid, reaction_kind) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.reaction_names(uuid[], uuid[]) TO authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.friend_posts(integer) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.friend_posts(integer) FROM anon;
END
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.friend_posts(integer) TO authenticated;
