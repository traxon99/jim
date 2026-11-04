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
