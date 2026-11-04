ALTER TABLE "users" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
-- Hand-authored (drizzle-kit can't express functions): friend profiles
-- (issues #751/#752). `friend_posts` gains `p_friend_id` like
-- `friend_workouts` (0061). `friend_profile` returns header stats for one
-- accepted friend by username; null when they aren't a friend.
DROP FUNCTION public.friend_posts(integer);
--> statement-breakpoint
CREATE FUNCTION public.friend_posts(p_limit integer DEFAULT 30, p_friend_id uuid DEFAULT NULL)
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
  WHERE (p_friend_id IS NULL OR p.user_id = p_friend_id)
    AND (p.session_id IS NULL OR s.deleted_at IS NULL)
  ORDER BY p.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 30), 1), 100)
$$;
--> statement-breakpoint
CREATE FUNCTION public.friend_profile(p_username text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH target AS (
    SELECT u.*
    FROM users u
    JOIN friendships f ON f.status = 'accepted'
      AND auth.uid() IN (f.requester_id, f.addressee_id)
      AND u.id = CASE WHEN f.requester_id = auth.uid() THEN f.addressee_id ELSE f.requester_id END
    WHERE lower(u.username) = lower(p_username)
    LIMIT 1
  ),
  workout_count AS (
    SELECT count(*) AS n
    FROM sessions s
    JOIN target t ON t.id = s.user_id
    WHERE s.ended_at IS NOT NULL AND s.deleted_at IS NULL
  ),
  friend_count AS (
    SELECT count(*) AS n
    FROM friendships f
    JOIN target t ON t.id IN (f.requester_id, f.addressee_id)
    WHERE f.status = 'accepted'
  ),
  session_dates AS (
    SELECT coalesce(
      jsonb_agg(s.started_at ORDER BY s.started_at DESC),
      '[]'::jsonb
    ) AS dates
    FROM sessions s
    JOIN target t ON t.id = s.user_id
    WHERE s.ended_at IS NOT NULL AND s.deleted_at IS NULL
      AND s.started_at > now() - interval '400 days'
  ),
  home_gym AS (
    SELECT g.name
    FROM gyms g
    JOIN target t ON t.id = g.user_id
    WHERE g.is_default AND g.deleted_at IS NULL
    ORDER BY g.updated_at DESC
    LIMIT 1
  ),
  highlights AS (
    SELECT coalesce(jsonb_agg(row ORDER BY row->>'key'), '[]'::jsonb) AS lifts
    FROM (
      SELECT DISTINCT ON (e.slug)
        jsonb_build_object(
          'key', CASE e.slug
            WHEN 'barbell-bench-press-medium-grip' THEN 'bench'
            WHEN 'barbell-squat' THEN 'squat'
            WHEN 'barbell-deadlift' THEN 'deadlift'
            WHEN 'standing-military-press' THEN 'ohp'
            WHEN 'bent-over-barbell-row' THEN 'row'
          END,
          'label', CASE e.slug
            WHEN 'barbell-bench-press-medium-grip' THEN 'Bench'
            WHEN 'barbell-squat' THEN 'Squat'
            WHEN 'barbell-deadlift' THEN 'Deadlift'
            WHEN 'standing-military-press' THEN 'OHP'
            WHEN 'bent-over-barbell-row' THEN 'Row'
          END,
          'e1rm', pr.value::float,
          'units', t.units
        ) AS row
      FROM target t
      JOIN personal_records pr ON pr.user_id = t.id AND pr.deleted_at IS NULL AND pr.kind = '1rm'
      JOIN exercises e ON e.id = pr.exercise_id
      WHERE t.share_workout_details
        AND e.slug IN (
          'barbell-bench-press-medium-grip',
          'barbell-squat',
          'barbell-deadlift',
          'standing-military-press',
          'bent-over-barbell-row'
        )
      ORDER BY e.slug, pr.value DESC
    ) sub
  )
  SELECT CASE WHEN EXISTS (SELECT 1 FROM target) THEN jsonb_build_object(
    'userId', (SELECT id FROM target),
    'username', (SELECT username FROM target),
    'avatar', (SELECT avatar FROM target),
    'displayName', (SELECT display_name FROM target),
    'bio', (SELECT bio FROM target),
    'shareWorkouts', (SELECT share_workouts FROM target),
    'shareWorkoutDetails', (SELECT share_workout_details FROM target),
    'units', (SELECT units FROM target),
    'weekStart', (SELECT week_start FROM target),
    'timeZone', (SELECT time_zone FROM target),
    'workoutCount', (SELECT n FROM workout_count),
    'friendCount', (SELECT n FROM friend_count),
    'sessionDates', (SELECT dates FROM session_dates),
    'defaultGymName', (SELECT name FROM home_gym),
    'liftHighlights', (SELECT lifts FROM highlights)
  ) ELSE NULL END
$$;
--> statement-breakpoint
CREATE FUNCTION public.friend_records(p_friend_id uuid)
RETURNS TABLE (
  exercise_name text,
  kind text,
  value numeric,
  weight numeric,
  reps integer,
  achieved_at timestamptz
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
  owner AS (
    SELECT u.id, u.share_workout_details
    FROM users u
    JOIN friend_ids fi ON fi.id = u.id
    WHERE u.id = p_friend_id
  )
  SELECT e.name, pr.kind::text, pr.value, s.weight, s.reps, pr.achieved_at
  FROM personal_records pr
  JOIN owner o ON o.id = pr.user_id AND o.share_workout_details
  JOIN exercises e ON e.id = pr.exercise_id
  LEFT JOIN sets s ON s.id = pr.set_id
  WHERE pr.deleted_at IS NULL
  ORDER BY pr.achieved_at DESC
  LIMIT 100
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.friend_posts(integer, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.friend_profile(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.friend_records(uuid) FROM PUBLIC;
--> statement-breakpoint
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.friend_posts(integer, uuid) FROM anon;
  REVOKE ALL ON FUNCTION public.friend_profile(text) FROM anon;
  REVOKE ALL ON FUNCTION public.friend_records(uuid) FROM anon;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.friend_posts(integer, uuid) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.friend_profile(text) TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.friend_records(uuid) TO authenticated;
