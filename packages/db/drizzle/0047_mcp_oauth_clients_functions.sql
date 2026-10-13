-- MCP OAuth client registrations (issue #499). Hand-authored: drizzle-kit
-- can't express functions, so don't regenerate over this file.
--
-- A client registers (RFC 7591) before anyone has signed in, and the MCP
-- server holds no service-role key (ADR-006), so these two functions are the
-- only way to read or write mcp_oauth_clients. A registration is public
-- metadata the client chose for itself (redirect URIs, a name), so letting
-- anon store and look one up by its random client_id reveals nothing.
CREATE FUNCTION public.register_mcp_oauth_client(p_client_id text, p_registration jsonb) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO mcp_oauth_clients (client_id, registration)
  SELECT p_client_id, p_registration
  WHERE octet_length(p_registration::text) <= 16384
  ON CONFLICT (client_id) DO NOTHING
$$;
--> statement-breakpoint
CREATE FUNCTION public.get_mcp_oauth_client(p_client_id text) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT registration FROM mcp_oauth_clients WHERE client_id = p_client_id
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.register_mcp_oauth_client(text, jsonb) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.get_mcp_oauth_client(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.register_mcp_oauth_client(text, jsonb) TO anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.get_mcp_oauth_client(text) TO anon, authenticated;
