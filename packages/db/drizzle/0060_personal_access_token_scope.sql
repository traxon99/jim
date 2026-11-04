ALTER TABLE "personal_access_tokens" ADD COLUMN "scope" text DEFAULT 'read_write' NOT NULL;--> statement-breakpoint
ALTER TABLE "personal_access_tokens" ADD CONSTRAINT "personal_access_tokens_scope" CHECK ("personal_access_tokens"."scope" IN ('read', 'read_write'));--> statement-breakpoint
-- Hand-added below (drizzle-kit can't express functions): the scope-aware
-- version of migration 0027's resolver, same SECURITY DEFINER pattern.
--
-- 0027's resolver stays for an MCP server deployed before this migration,
-- which keeps running until the deploy workflow replaces it. That server
-- doesn't know about scopes, so the old resolver now only resolves
-- read_write tokens: a read token it can't see is refused, never granted
-- write access.
CREATE OR REPLACE FUNCTION public.resolve_personal_access_token(p_token_hash text) RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE personal_access_tokens
  SET last_used_at = now()
  WHERE token_hash = p_token_hash
    AND scope = 'read_write'
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  RETURNING user_id
$$;
--> statement-breakpoint
CREATE FUNCTION public.resolve_personal_access_token_scoped(p_token_hash text)
RETURNS TABLE (user_id uuid, scope text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE personal_access_tokens
  SET last_used_at = now()
  WHERE token_hash = p_token_hash
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  RETURNING personal_access_tokens.user_id, personal_access_tokens.scope
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_personal_access_token_scoped(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_personal_access_token_scoped(text) TO anon, authenticated;
