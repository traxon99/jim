-- Friends (issue #35). Hand-authored: drizzle-kit can't express functions or
-- triggers, so don't regenerate over this file.
--
-- Every table sync pulls keeps its own-rows-only RLS (ADR-005): /api/sync/pull
-- selects under RLS with no user_id filter of its own, so a policy letting a
-- friend's sessions through would copy them into this user's IndexedDB. Friend
-- data is instead read, and friendships written, only through the SECURITY
-- DEFINER functions below. Each one acts for auth.uid() alone, checks the
-- friendship itself, and returns a summary rather than raw rows.

-- The email-derived username a user gets until they pick one: the email's
-- local part, lowercased, stripped to [a-z0-9._-], with a number appended on a
-- clash. Mirrors @jim/core's defaultUsernameFromEmail.
CREATE FUNCTION public.default_username(p_email text, p_user_id uuid) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  base text;
  candidate text;
  n integer := 1;
BEGIN
  base := left(regexp_replace(lower(split_part(coalesce(p_email, ''), '@', 1)), '[^a-z0-9._-]', '', 'g'), 24);
  IF base = '' THEN
    base := 'user';
  END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM users WHERE username = candidate AND id <> p_user_id) LOOP
    n := n + 1;
    candidate := base || n;
  END LOOP;
  RETURN candidate;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.default_username(text, uuid) FROM PUBLIC;
--> statement-breakpoint
-- Existing ("legacy") users, oldest first so the earliest account keeps the
-- unsuffixed name. One UPDATE per row so each sees the names given before it.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id, email FROM users WHERE username IS NULL ORDER BY created_at, id LOOP
    UPDATE users SET username = public.default_username(r.email, r.id) WHERE id = r.id;
  END LOOP;
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.users_default_username() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.username IS NULL THEN
    NEW.username := public.default_username(NEW.email, NEW.id);
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.users_default_username() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER users_default_username
BEFORE INSERT ON users
FOR EACH ROW EXECUTE FUNCTION public.users_default_username();
--> statement-breakpoint
-- Sends a friend request to the user whose username is exactly
-- `p_username`. Returns what happened: 'sent', 'accepted' (they had already
-- asked us, so this accepts), 'already_friends', 'already_requested',
-- 'not_found' or 'self'.
CREATE FUNCTION public.send_friend_request(p_username text) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me uuid := auth.uid();
  target uuid;
  existing friendships%ROWTYPE;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO target FROM users WHERE username = lower(trim(p_username));
  IF target IS NULL THEN
    RETURN 'not_found';
  END IF;
  IF target = me THEN
    RETURN 'self';
  END IF;
  SELECT * INTO existing FROM friendships
  WHERE least(requester_id, addressee_id) = least(me, target)
    AND greatest(requester_id, addressee_id) = greatest(me, target);
  IF FOUND THEN
    IF existing.status = 'accepted' THEN
      RETURN 'already_friends';
    ELSIF existing.requester_id = me THEN
      RETURN 'already_requested';
    END IF;
    UPDATE friendships SET status = 'accepted', accepted_at = now() WHERE id = existing.id;
    RETURN 'accepted';
  END IF;
  INSERT INTO friendships (requester_id, addressee_id) VALUES (me, target);
  RETURN 'sent';
END
$$;
--> statement-breakpoint
-- Accepts (or, with p_accept false, declines and deletes) a pending request
-- `p_requester` sent to the current user. False when there's no such request.
CREATE FUNCTION public.respond_to_friend_request(p_requester uuid, p_accept boolean) RETURNS boolean
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
  IF p_accept THEN
    UPDATE friendships SET status = 'accepted', accepted_at = now()
    WHERE requester_id = p_requester AND addressee_id = me AND status = 'pending';
  ELSE
    DELETE FROM friendships
    WHERE requester_id = p_requester AND addressee_id = me AND status = 'pending';
  END IF;
  RETURN FOUND;
END
$$;
--> statement-breakpoint
-- Unfriends `p_other`, or cancels a request either of the two sent.
CREATE FUNCTION public.remove_friend(p_other uuid) RETURNS boolean
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
  DELETE FROM friendships
  WHERE (requester_id = me AND addressee_id = p_other)
     OR (requester_id = p_other AND addressee_id = me);
  RETURN FOUND;
END
$$;
--> statement-breakpoint
-- The current user's friends and pending requests, with each other person's
-- username. `direction` is 'incoming' or 'outgoing' for a pending request and
-- null once accepted.
CREATE FUNCTION public.list_friends()
RETURNS TABLE (user_id uuid, username text, status text, direction text, since timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    other.id,
    other.username,
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
-- Accepted friends' most recent finished workouts, newest first. Each carries
-- its exercises in order with how many sets were logged and the heaviest one,
-- in the friend's own units. Only current sets count: not tombstoned, and not
-- superseded by an edit (ADR-003).
CREATE FUNCTION public.friend_workouts(p_limit integer DEFAULT 30)
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  username text,
  units text,
  name text,
  started_at timestamptz,
  ended_at timestamptz,
  exercises jsonb
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
    ), '[]'::jsonb)
  FROM recent r
  JOIN users u ON u.id = r.user_id
  ORDER BY r.started_at DESC
$$;
--> statement-breakpoint
-- Only signed-in users call these; PostgREST would otherwise expose them to
-- `anon` too (auth.uid() is null there, but there's no reason to offer them).
REVOKE ALL ON FUNCTION public.send_friend_request(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.respond_to_friend_request(uuid, boolean) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.remove_friend(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.list_friends() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.friend_workouts(integer) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.default_username(text, uuid) FROM anon, authenticated;
  REVOKE ALL ON FUNCTION public.users_default_username() FROM anon, authenticated;
  REVOKE ALL ON FUNCTION public.send_friend_request(text) FROM anon;
  REVOKE ALL ON FUNCTION public.respond_to_friend_request(uuid, boolean) FROM anon;
  REVOKE ALL ON FUNCTION public.remove_friend(uuid) FROM anon;
  REVOKE ALL ON FUNCTION public.list_friends() FROM anon;
  REVOKE ALL ON FUNCTION public.friend_workouts(integer) FROM anon;
END
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.send_friend_request(text) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.respond_to_friend_request(uuid, boolean) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.remove_friend(uuid) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.list_friends() TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.friend_workouts(integer) TO authenticated;
