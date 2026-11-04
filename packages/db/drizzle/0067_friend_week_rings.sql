-- Home week rings (issue #750). Hand-authored like 0023/0061.
--
-- Returns finished workout start times for the signed-in user or an accepted
-- friend, within a window the app computes from each person's week_start and
-- time_zone (@jim/core's startOfWeek). SECURITY DEFINER so friend rows never
-- reach IndexedDB.

CREATE FUNCTION public.friend_sessions_in_range(
  p_user_id uuid,
  p_since timestamptz,
  p_until timestamptz
)
RETURNS TABLE (started_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.started_at
  FROM sessions s
  WHERE s.user_id = p_user_id
    AND s.ended_at IS NOT NULL
    AND s.deleted_at IS NULL
    AND s.started_at >= p_since
    AND s.started_at < p_until
    AND (
      p_user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM friendships f
        WHERE f.status = 'accepted'
          AND auth.uid() IN (f.requester_id, f.addressee_id)
          AND p_user_id IN (f.requester_id, f.addressee_id)
      )
    );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.friend_sessions_in_range(uuid, timestamptz, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.friend_sessions_in_range(uuid, timestamptz, timestamptz) TO authenticated;
--> statement-breakpoint
-- Week-ring settings for accepted friends. Users RLS only exposes your own row,
-- so this runs as definer like list_friends().
CREATE FUNCTION public.friend_week_ring_peers()
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar text,
  share_workouts boolean,
  weekly_workout_goal smallint,
  week_start smallint,
  time_zone text
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
    other.share_workouts,
    other.weekly_workout_goal,
    other.week_start,
    other.time_zone
  FROM friendships f
  JOIN users other
    ON other.id = CASE WHEN f.requester_id = auth.uid() THEN f.addressee_id ELSE f.requester_id END
  WHERE f.status = 'accepted'
    AND auth.uid() IN (f.requester_id, f.addressee_id)
  ORDER BY other.username
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.friend_week_ring_peers() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.friend_week_ring_peers() TO authenticated;
