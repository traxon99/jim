-- Personal access tokens (issue #246). Hand-authored: drizzle-kit can't
-- express functions, so don't regenerate over this file.
--
-- The MCP server holds no service-role key (ADR-006), so before it knows who
-- is calling it can't read personal_access_tokens under RLS. This function is
-- its one way in: given the SHA-256 hash of a presented token, it returns the
-- owner's id if the token exists, isn't revoked and hasn't expired, and
-- stamps last_used_at. Everything the MCP server does afterwards runs as that
-- user under RLS, exactly like an OAuth session. Knowing a hash already
-- requires the token itself (or being its owner), so the function reveals
-- nothing a caller didn't have.
CREATE FUNCTION public.resolve_personal_access_token(p_token_hash text) RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE personal_access_tokens
  SET last_used_at = now()
  WHERE token_hash = p_token_hash
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  RETURNING user_id
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_personal_access_token(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_personal_access_token(text) TO anon, authenticated;
