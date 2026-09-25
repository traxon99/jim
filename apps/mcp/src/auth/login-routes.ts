import { randomUUID } from "node:crypto";
import express, { type Router } from "express";
import { rateLimit } from "express-rate-limit";
import { errorPage, loginFormPage } from "./pages.js";
import { issuedAuthorizationCodes, pendingAuthorizations } from "./store.js";
import { createSignInClient } from "./supabase.js";

const EXPIRED_MESSAGE =
  "This sign-in link has expired. Reconnect from your MCP client to try again.";

/** Password guesses per client IP per window, on top of Supabase's own limits. */
const LOGIN_ATTEMPTS_PER_WINDOW = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * The user-facing half of the OAuth `/authorize` flow: `SupabaseOAuthProvider.authorize`
 * (see provider.ts) redirects here rather than finishing the flow itself,
 * since finishing it requires the user to sign in. Mounted at the app root,
 * alongside (but outside of) the SDK's `mcpAuthRouter` — these paths aren't
 * part of the OAuth spec itself, just this server's own way of implementing
 * the "authenticate the user" step: an email/password form checked against
 * Supabase Auth, the same credentials as the web app.
 */
export function loginRoutes(): Router {
  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));

  router.get("/login", (req, res) => {
    const loginId = typeof req.query.login === "string" ? req.query.login : undefined;
    const pending = loginId ? pendingAuthorizations.peek(loginId) : undefined;
    if (!pending) {
      res.status(400).send(errorPage(EXPIRED_MESSAGE));
      return;
    }
    res.send(loginFormPage(loginId as string, pending.client.client_name));
  });

  const loginLimiter = rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    limit: LOGIN_ATTEMPTS_PER_WINDOW,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => {
      res
        .status(429)
        .send(errorPage("Too many sign-in attempts. Wait a few minutes and try again."));
    },
  });

  router.post("/login", loginLimiter, async (req, res) => {
    const loginId = typeof req.body?.login === "string" ? req.body.login : undefined;
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const pending = loginId ? pendingAuthorizations.peek(loginId) : undefined;

    if (!pending) {
      res.status(400).send(errorPage(EXPIRED_MESSAGE));
      return;
    }
    const clientName = pending.client.client_name;
    if (!email || !password) {
      res
        .status(400)
        .send(
          loginFormPage(loginId as string, clientName, "Enter your email and password.", email),
        );
      return;
    }

    const { data, error } = await createSignInClient().auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session) {
      res
        .status(401)
        .send(loginFormPage(loginId as string, clientName, "Incorrect email or password.", email));
      return;
    }

    // Consume the pending authorization only now, so a mistyped password can be retried.
    const authorization = pendingAuthorizations.take(loginId as string);
    if (!authorization) {
      res.status(400).send(errorPage(EXPIRED_MESSAGE));
      return;
    }

    const code = randomUUID();
    issuedAuthorizationCodes.set(code, {
      clientId: authorization.client.client_id,
      redirectUri: authorization.params.redirectUri,
      codeChallenge: authorization.params.codeChallenge,
      supabaseAccessToken: data.session.access_token,
      supabaseRefreshToken: data.session.refresh_token,
      createdAt: Date.now(),
    });

    const redirect = new URL(authorization.params.redirectUri);
    redirect.searchParams.set("code", code);
    if (authorization.params.state) redirect.searchParams.set("state", authorization.params.state);

    // 303 so the browser follows with a GET, whatever the client's redirect_uri serves.
    res.redirect(303, redirect.href);
  });

  return router;
}
