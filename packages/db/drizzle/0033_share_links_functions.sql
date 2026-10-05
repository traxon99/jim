-- Routine and program share links (issue #254). Hand-authored for the same
-- reason as 0023, 0025 and 0031: drizzle-kit can't express functions, so
-- don't regenerate over this file. `share_links` is readable by its sharer
-- only (0032); anyone else signed in opens a link through this function,
-- which hands back that one snapshot and the sharer's username, nothing
-- else of theirs. A revoked (deleted) link returns no row.

CREATE FUNCTION public.get_share_link(p_id uuid)
RETURNS TABLE (
  id uuid,
  kind text,
  name text,
  snapshot jsonb,
  created_at timestamptz,
  username text,
  is_mine boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    l.id,
    l.kind::text,
    l.name,
    l.snapshot,
    l.created_at,
    u.username,
    l.user_id = auth.uid()
  FROM share_links l
  JOIN users u ON u.id = l.user_id
  WHERE l.id = p_id AND auth.uid() IS NOT NULL
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.get_share_link(uuid) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.get_share_link(uuid) FROM anon;
END
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.get_share_link(uuid) TO authenticated;
