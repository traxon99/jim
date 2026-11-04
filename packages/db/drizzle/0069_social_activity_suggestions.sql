-- Social notifications bell (#753) and People you may know (#754).
-- Hand-authored: functions and triggers, like 0023/0031.

ALTER TABLE "users" ADD COLUMN "last_seen_activity_at" timestamptz;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "discoverable_by_friends_of_friends" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE TABLE "dismissed_friend_suggestions" (
	"user_id" uuid NOT NULL,
	"suggested_user_id" uuid NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dismissed_friend_suggestions_user_id_suggested_user_id_pk" PRIMARY KEY("user_id","suggested_user_id")
);--> statement-breakpoint
ALTER TABLE "dismissed_friend_suggestions" ADD CONSTRAINT "dismissed_friend_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dismissed_friend_suggestions" ADD CONSTRAINT "dismissed_friend_suggestions_suggested_user_id_users_id_fk" FOREIGN KEY ("suggested_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dismissed_friend_suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "dismissed_friend_suggestions_select_own" ON "dismissed_friend_suggestions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_id" = ( SELECT auth.uid() AS uid));--> statement-breakpoint
CREATE FUNCTION public.mark_activity_seen() RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  seen timestamptz;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  seen := now();
  UPDATE users SET last_seen_activity_at = seen WHERE id = me;
  RETURN seen;
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.activity_has_unread() RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH me AS (
    SELECT id, last_seen_activity_at FROM users WHERE id = auth.uid()
  )
  SELECT EXISTS (
    SELECT 1
    FROM workout_reactions r
    JOIN sessions s ON s.id = r.session_id
    WHERE s.user_id = (SELECT id FROM me)
      AND s.deleted_at IS NULL
      AND r.user_id <> (SELECT id FROM me)
      AND r.created_at > coalesce((SELECT last_seen_activity_at FROM me), '-infinity'::timestamptz)
  )
  OR EXISTS (
    SELECT 1
    FROM post_reactions pr
    JOIN posts p ON p.id = pr.post_id
    WHERE p.user_id = (SELECT id FROM me)
      AND pr.user_id <> (SELECT id FROM me)
      AND pr.created_at > coalesce((SELECT last_seen_activity_at FROM me), '-infinity'::timestamptz)
  )
  OR EXISTS (
    SELECT 1
    FROM friendships f
    WHERE f.addressee_id = (SELECT id FROM me)
      AND f.status = 'pending'
      AND f.created_at > coalesce((SELECT last_seen_activity_at FROM me), '-infinity'::timestamptz)
  )
  OR EXISTS (
    SELECT 1
    FROM comments c
    WHERE c.deleted_at IS NULL
      AND c.user_id <> (SELECT id FROM me)
      AND c.created_at > coalesce((SELECT last_seen_activity_at FROM me), '-infinity'::timestamptz)
      AND (
        EXISTS (
          SELECT 1 FROM sessions s
          WHERE s.id = c.session_id AND s.user_id = (SELECT id FROM me) AND s.deleted_at IS NULL
        )
        OR EXISTS (SELECT 1 FROM posts p WHERE p.id = c.post_id AND p.user_id = (SELECT id FROM me))
      )
  );
$$;
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
  reaction_kind text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM (
    SELECT
      'wr:' || r.session_id::text || ':' || r.user_id::text || ':' || r.kind::text AS activity_id,
      'workout_reaction'::text AS kind,
      r.created_at AS occurred_at,
      u.id AS actor_user_id,
      u.username AS actor_username,
      u.avatar AS actor_avatar,
      s.id AS session_id,
      s.name AS session_name,
      (
        SELECT p.id FROM posts p
        WHERE p.user_id = s.user_id AND p.session_id = s.id
        ORDER BY p.created_at DESC
        LIMIT 1
      ) AS post_id,
      NULL::uuid AS comment_id,
      r.kind::text AS reaction_kind
    FROM workout_reactions r
    JOIN sessions s ON s.id = r.session_id
    JOIN users u ON u.id = r.user_id
    WHERE s.user_id = auth.uid()
      AND s.deleted_at IS NULL
      AND r.user_id <> auth.uid()

    UNION ALL

    SELECT
      'fr:' || f.id::text,
      'friend_request'::text,
      f.created_at,
      u.id,
      u.username,
      u.avatar,
      NULL::uuid,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      NULL::text
    FROM friendships f
    JOIN users u ON u.id = f.requester_id
    WHERE f.addressee_id = auth.uid() AND f.status = 'pending'

    UNION ALL

    SELECT
      'pr:' || pr.post_id::text || ':' || pr.user_id::text || ':' || pr.kind::text,
      'post_reaction'::text,
      pr.created_at,
      u.id,
      u.username,
      u.avatar,
      p.session_id,
      (SELECT s.name FROM sessions s WHERE s.id = p.session_id),
      p.id,
      NULL::uuid,
      pr.kind::text
    FROM post_reactions pr
    JOIN posts p ON p.id = pr.post_id
    JOIN users u ON u.id = pr.user_id
    WHERE p.user_id = auth.uid() AND pr.user_id <> auth.uid()

    UNION ALL

    SELECT
      'cm:' || c.id::text,
      'comment'::text,
      c.created_at,
      u.id,
      u.username,
      u.avatar,
      c.session_id,
      (SELECT s.name FROM sessions s WHERE s.id = c.session_id),
      c.post_id,
      c.id,
      NULL::text
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.deleted_at IS NULL
      AND c.user_id <> auth.uid()
      AND (
        EXISTS (
          SELECT 1 FROM sessions s
          WHERE s.id = c.session_id AND s.user_id = auth.uid() AND s.deleted_at IS NULL
        )
        OR EXISTS (SELECT 1 FROM posts p WHERE p.id = c.post_id AND p.user_id = auth.uid())
      )
  ) combined
  ORDER BY occurred_at DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
$$;
--> statement-breakpoint
CREATE FUNCTION public.dismiss_friend_suggestion(p_user_id uuid) RETURNS boolean
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
  IF p_user_id IS NULL OR p_user_id = me THEN
    RETURN false;
  END IF;
  INSERT INTO dismissed_friend_suggestions (user_id, suggested_user_id)
  VALUES (me, p_user_id)
  ON CONFLICT (user_id, suggested_user_id) DO NOTHING;
  RETURN true;
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.friend_suggestions(p_limit integer DEFAULT 20)
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar text,
  reason text,
  mutual_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH me AS (SELECT auth.uid() AS id),
  my_friends AS (
    SELECT CASE WHEN f.requester_id = (SELECT id FROM me) THEN f.addressee_id ELSE f.requester_id END AS friend_id
    FROM friendships f
    WHERE f.status = 'accepted'
      AND (SELECT id FROM me) IN (f.requester_id, f.addressee_id)
  ),
  blocked AS (
    SELECT CASE WHEN f.requester_id = (SELECT id FROM me) THEN f.addressee_id ELSE f.requester_id END AS other_id
    FROM friendships f
    WHERE (SELECT id FROM me) IN (f.requester_id, f.addressee_id)
  ),
  candidates AS (
    SELECT
      u.id,
      u.username,
      u.avatar,
      COUNT(DISTINCT mf.friend_id)::integer AS mutual_count,
      MIN(mu.username ORDER BY mu.username) AS sample_mutual_username,
      (
        SELECT g2.name
        FROM gyms g1
        JOIN gyms g2
          ON g2.user_id = u.id
         AND g2.deleted_at IS NULL
         AND g1.latitude IS NOT NULL
         AND g1.longitude IS NOT NULL
         AND g2.latitude = g1.latitude
         AND g2.longitude = g1.longitude
        WHERE g1.user_id = (SELECT id FROM me)
          AND g1.deleted_at IS NULL
        ORDER BY g1.is_default DESC, g1.position
        LIMIT 1
      ) AS shared_gym_name
    FROM my_friends mf
    JOIN friendships ff
      ON ff.status = 'accepted'
     AND mf.friend_id IN (ff.requester_id, ff.addressee_id)
    JOIN users u
      ON u.id = CASE WHEN ff.requester_id = mf.friend_id THEN ff.addressee_id ELSE ff.requester_id END
    JOIN users mu ON mu.id = mf.friend_id
    WHERE u.id <> (SELECT id FROM me)
      AND u.discoverable_by_friends_of_friends
      AND NOT EXISTS (SELECT 1 FROM blocked b WHERE b.other_id = u.id)
      AND NOT EXISTS (
        SELECT 1 FROM dismissed_friend_suggestions d
        WHERE d.user_id = (SELECT id FROM me) AND d.suggested_user_id = u.id
      )
    GROUP BY u.id, u.username, u.avatar
  )
  SELECT
    c.id,
    c.username,
    c.avatar,
    CASE
      WHEN c.shared_gym_name IS NOT NULL THEN 'Trains at ' || c.shared_gym_name
      WHEN c.mutual_count = 1 THEN 'Friends with ' || c.sample_mutual_username
      ELSE c.mutual_count::text || ' mutual friends'
    END AS reason,
    c.mutual_count
  FROM candidates c
  ORDER BY c.mutual_count DESC, c.username
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 50)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mark_activity_seen() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.activity_has_unread() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_activity(integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.dismiss_friend_suggestion(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.friend_suggestions(integer) FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.mark_activity_seen() FROM anon;
  REVOKE ALL ON FUNCTION public.activity_has_unread() FROM anon;
  REVOKE ALL ON FUNCTION public.list_activity(integer) FROM anon;
  REVOKE ALL ON FUNCTION public.dismiss_friend_suggestion(uuid) FROM anon;
  REVOKE ALL ON FUNCTION public.friend_suggestions(integer) FROM anon;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mark_activity_seen() TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.activity_has_unread() TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.list_activity(integer) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.dismiss_friend_suggestion(uuid) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.friend_suggestions(integer) TO authenticated;
