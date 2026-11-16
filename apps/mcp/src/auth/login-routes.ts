import { randomUUID } from "node:crypto";
import express, { type Router } from "express";
import { rateLimit } from "express-rate-limit";
import { codeFormPage, errorPage, loginFormPage } from "./pages.js";
import {
  type PendingAuthorization,
  issuedAuthorizationCodes,
  pendingAuthorizations,
  pendingCodes,
} from "./store.js";
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
  // The sign-in page grants access, so no other site may frame it and
  // trick a click through (#509).
  router.use((_req, res, next) => {
    res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });

  router.get("/login", (req, res) => {
    const loginId = typeof req.query.login === "string" ? req.query.login : undefined;
    const pending = loginId ? pendingAuthorizations.peek(loginId) : undefined;
    if (!pending) {
      res.status(400).send(errorPage(EXPIRED_MESSAGE));
      return;
    }
    res.send(
      loginFormPage({
        loginId: loginId as string,
        clientName: pending.client.client_name,
        redirectUri: pending.params.redirectUri,
      }),
    );
  });

  // Password guesses and code guesses are limited separately.
  const loginLimiter = attemptLimiter();
  const codeLimiter = attemptLimiter();

  router.post("/login", loginLimiter, async (req, res) => {
    const loginId = typeof req.body?.login === "string" ? req.body.login : undefined;
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const pending = loginId ? pendingAuthorizations.peek(loginId) : undefined;

    if (!pending) {
      res.status(400).send(errorPage(EXPIRED_MESSAGE));
      return;
    }
    const form = (error: string) =>
      loginFormPage({
        loginId: loginId as string,
        clientName: pending.client.client_name,
        redirectUri: pending.params.redirectUri,
        error,
        email,
      });
    if (!email || !password) {
      res.status(400).send(form("Enter your email and password."));
      return;
    }

    const client = createSignInClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      res.status(401).send(form("Incorrect email or password."));
      return;
    }

    // Consume the pending authorization only now, so a mistyped password can be retried.
    const authorization = pendingAuthorizations.take(loginId as string);
    if (!authorization) {
      res.status(400).send(errorPage(EXPIRED_MESSAGE));
      return;
    }

    // An account with an authenticator app set up must pass its code too,
    // as /admin does (ADR-023): only then is the session aal2.
    const { data: level } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (level?.nextLevel === "aal2" && level.currentLevel !== "aal2") {
      const codeId = randomUUID();
      pendingCodes.set(codeId, {
        authorization,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        createdAt: Date.now(),
      });
      res.send(codeFormPage({ codeId }));
      return;
    }

    finish(res, authorization, data.session);
  });

  router.post("/login/code", codeLimiter, async (req, res) => {
    const codeId = typeof req.body?.code_id === "string" ? req.body.code_id : undefined;
    const code = typeof req.body?.code === "string" ? req.body.code.replace(/\s/g, "") : "";
    const pending = codeId ? pendingCodes.peek(codeId) : undefined;
    if (!pending) {
      res.status(400).send(errorPage(EXPIRED_MESSAGE));
      return;
    }
    const retry = (message: string) =>
      res.status(401).send(codeFormPage({ codeId: codeId as string, error: message }));
    if (!/^\d{6}$/.test(code)) {
      retry("Enter the 6-digit code from your authenticator app.");
      return;
    }

    const client = createSignInClient();
    const { error: sessionError } = await client.auth.setSession({
      access_token: pending.accessToken,
      refresh_token: pending.refreshToken,
    });
    const { data: factors } = sessionError ? { data: null } : await client.auth.mfa.listFactors();
    const factor = factors?.totp.find((candidate) => candidate.status === "verified");
    if (!factor) {
      pendingCodes.take(codeId as string);
      res.status(400).send(errorPage(EXPIRED_MESSAGE));
      return;
    }
    const { data: verified, error } = await client.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code,
    });
    if (error || !verified) {
      retry("That code didn't work. Try the current one.");
      return;
    }

    pendingCodes.take(codeId as string);
    finish(res, pending.authorization, verified);
  });

  return router;
}

function attemptLimiter() {
  return rateLimit({
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
}

/** Hands the client an authorization code for the session and sends the browser back. */
function finish(
  res: express.Response,
  authorization: PendingAuthorization,
  session: { access_token: string; refresh_token: string },
): void {
  const code = randomUUID();
  issuedAuthorizationCodes.set(code, {
    clientId: authorization.client.client_id,
    redirectUri: authorization.params.redirectUri,
    codeChallenge: authorization.params.codeChallenge,
    supabaseAccessToken: session.access_token,
    supabaseRefreshToken: session.refresh_token,
    createdAt: Date.now(),
  });

  const redirect = new URL(authorization.params.redirectUri);
  redirect.searchParams.set("code", code);
  if (authorization.params.state) redirect.searchParams.set("state", authorization.params.state);

  // 303 so the browser follows with a GET, whatever the client's redirect_uri serves.
  res.redirect(303, redirect.href);
}
