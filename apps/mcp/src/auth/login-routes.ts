import { randomUUID } from "node:crypto";
import express, { type Router } from "express";
import { callbackBridgePage, checkEmailPage, errorPage, loginFormPage } from "./pages.js";
import { issuedAuthorizationCodes, pendingAuthorizations } from "./store.js";
import { getSupabase } from "./supabase.js";

/**
 * The user-facing half of the OAuth `/authorize` flow: `SupabaseOAuthProvider.authorize`
 * (see provider.ts) redirects here rather than finishing the flow itself,
 * since finishing it requires a magic-link round trip through the user's
 * inbox. Mounted at the app root, alongside (but outside of) the SDK's
 * `mcpAuthRouter` — these paths aren't part of the OAuth spec itself, just
 * this server's own way of implementing the "authenticate the user" step.
 */
export function loginRoutes(issuerUrl: URL): Router {
  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));
  router.use(express.json());

  router.get("/login", (req, res) => {
    const loginId = typeof req.query.login === "string" ? req.query.login : undefined;
    const pending = loginId ? pendingAuthorizations.peek(loginId) : undefined;
    if (!pending) {
      res
        .status(400)
        .send(
          errorPage("This sign-in link has expired. Reconnect from your MCP client to try again."),
        );
      return;
    }
    res.send(loginFormPage(loginId as string, pending.client.client_name));
  });

  router.post("/login", async (req, res) => {
    const loginId = typeof req.body?.login === "string" ? req.body.login : undefined;
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : undefined;
    const pending = loginId ? pendingAuthorizations.peek(loginId) : undefined;

    if (!pending) {
      res
        .status(400)
        .send(
          errorPage("This sign-in link has expired. Reconnect from your MCP client to try again."),
        );
      return;
    }
    if (!email) {
      res
        .status(400)
        .send(
          loginFormPage(loginId as string, pending.client.client_name, "Enter an email address."),
        );
      return;
    }

    const { error } = await getSupabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: new URL(`/login/callback?login=${loginId}`, issuerUrl).href },
    });
    if (error) {
      res
        .status(400)
        .send(loginFormPage(loginId as string, pending.client.client_name, error.message));
      return;
    }

    res.send(checkEmailPage(email));
  });

  // GET: the magic link itself lands here, tokens in the URL fragment. Renders
  // the JS bridge page (see pages.ts) that forwards them to POST below.
  router.get("/login/callback", (req, res) => {
    const loginId = typeof req.query.login === "string" ? req.query.login : undefined;
    if (!loginId || !pendingAuthorizations.peek(loginId)) {
      res
        .status(400)
        .send(
          errorPage("This sign-in link has expired. Reconnect from your MCP client to try again."),
        );
      return;
    }
    res.send(callbackBridgePage(loginId));
  });

  // POST: the bridge page's fetch, carrying the tokens it read from the fragment.
  router.post("/login/callback", async (req, res) => {
    const loginId = typeof req.body?.login === "string" ? req.body.login : undefined;
    const accessToken =
      typeof req.body?.access_token === "string" ? req.body.access_token : undefined;
    const refreshToken =
      typeof req.body?.refresh_token === "string" ? req.body.refresh_token : undefined;

    const pending = loginId ? pendingAuthorizations.take(loginId) : undefined;
    if (!pending || !accessToken || !refreshToken) {
      res
        .status(400)
        .json({ error: "invalid_request", error_description: "sign-in session expired" });
      return;
    }

    const { data, error } = await getSupabase().auth.getClaims(accessToken);
    if (error || !data?.claims) {
      res.status(400).json({
        error: "access_denied",
        error_description: "could not verify the signed-in session",
      });
      return;
    }

    const code = randomUUID();
    issuedAuthorizationCodes.set(code, {
      clientId: pending.client.client_id,
      redirectUri: pending.params.redirectUri,
      codeChallenge: pending.params.codeChallenge,
      supabaseAccessToken: accessToken,
      supabaseRefreshToken: refreshToken,
      createdAt: Date.now(),
    });

    const redirect = new URL(pending.params.redirectUri);
    redirect.searchParams.set("code", code);
    if (pending.params.state) redirect.searchParams.set("state", pending.params.state);

    res.json({ redirect: redirect.href });
  });

  return router;
}
