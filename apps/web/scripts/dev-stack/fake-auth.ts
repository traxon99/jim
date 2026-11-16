import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";

/**
 * A local stand-in for the few Supabase Auth endpoints the app calls, so the
 * unchanged app signs in against the dev stack (issue #690). It knows one
 * user, the seeded one, and signs HS256 tokens with a secret made fresh on
 * every start. supabase-js verifies an HS256 token by calling GET /user
 * rather than fetching JWKS (auth-js `getClaims`), so that endpoint is what
 * makes the token count.
 *
 * Nothing in the app knows this exists: the app only sees a different
 * NEXT_PUBLIC_SUPABASE_URL. It listens on 127.0.0.1 and refuses to start in a
 * production or Vercel environment.
 *
 * It also fakes TOTP for /admin (issue #806): enrolling returns a placeholder
 * QR code, and any six-digit code verifies, lifting the session to aal2.
 */

export interface DevUser {
  id: string;
  email: string;
  password: string;
}

const ACCESS_TOKEN_SECONDS = 3600;

export function startFakeAuth(user: DevUser, port: number): Promise<() => Promise<void>> {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new Error("The fake auth server is for local development only.");
  }

  const secret = randomBytes(32);
  // Each refresh token remembers the assurance level it was issued at.
  const refreshTokens = new Map<string, "aal1" | "aal2">();
  const factors: {
    id: string;
    friendly_name: string;
    factor_type: "totp";
    status: "verified" | "unverified";
    created_at: string;
    updated_at: string;
  }[] = [];
  const createdAt = new Date().toISOString();

  const userJson = {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: createdAt,
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: createdAt,
    updated_at: createdAt,
    is_anonymous: false,
  };

  function sign(payload: Record<string, unknown>): string {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}`;
    return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
  }

  function verify(token: string): boolean {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return false;
    const expected = createHmac("sha256", secret)
      .update(`${header}.${payload}`)
      .digest("base64url");
    if (expected !== signature) return false;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    return claims.sub === user.id && claims.exp > Date.now() / 1000;
  }

  function session(aal: "aal1" | "aal2" = "aal1") {
    const now = Math.floor(Date.now() / 1000);
    const refreshToken = randomBytes(16).toString("hex");
    refreshTokens.set(refreshToken, aal);
    const amr = [{ method: "password", timestamp: now }];
    if (aal === "aal2") amr.push({ method: "totp", timestamp: now });
    return {
      access_token: sign({
        sub: user.id,
        email: user.email,
        role: "authenticated",
        aud: "authenticated",
        iat: now,
        exp: now + ACCESS_TOKEN_SECONDS,
        session_id: randomUUID(),
        is_anonymous: false,
        aal,
        amr,
        app_metadata: userJson.app_metadata,
        user_metadata: {},
      }),
      token_type: "bearer",
      expires_in: ACCESS_TOKEN_SECONDS,
      expires_at: now + ACCESS_TOKEN_SECONDS,
      refresh_token: refreshToken,
      user: currentUser(),
    };
  }

  function currentUser() {
    return { ...userJson, factors: [...factors] };
  }

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    const fail = (status: number, code: string, message: string) =>
      send(status, { code: status, error_code: code, msg: message });

    // The browser client calls this cross-origin from the app's port.
    response.setHeader("access-control-allow-origin", request.headers.origin ?? "*");
    response.setHeader("access-control-allow-credentials", "true");
    response.setHeader("access-control-allow-headers", "*");
    response.setHeader("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const body =
      request.method === "POST" || request.method === "PUT" ? await readJson(request) : {};

    if (url.pathname === "/auth/v1/token" && request.method === "POST") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") {
        if (body.email !== user.email || body.password !== user.password) {
          return fail(400, "invalid_credentials", "Invalid login credentials");
        }
        return send(200, session());
      }
      if (grant === "refresh_token") {
        const token = String(body.refresh_token ?? "");
        const aal = refreshTokens.get(token);
        if (!aal) return fail(400, "refresh_token_not_found", "Invalid Refresh Token");
        refreshTokens.delete(token);
        return send(200, session(aal));
      }
      return fail(400, "validation_failed", `Unsupported grant_type ${grant}`);
    }

    const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
    if (url.pathname === "/auth/v1/user") {
      if (!verify(bearer)) return fail(401, "bad_jwt", "invalid JWT");
      return send(200, currentUser());
    }
    const factorPath = url.pathname.match(
      /^\/auth\/v1\/factors(?:\/([^/]+))?(?:\/(challenge|verify))?$/,
    );
    if (factorPath) {
      if (!verify(bearer)) return fail(401, "bad_jwt", "invalid JWT");
      const [, factorId, action] = factorPath;
      if (!factorId && request.method === "POST") {
        const now = new Date().toISOString();
        const factor = {
          id: randomUUID(),
          friendly_name: String(body.friendly_name ?? "Authenticator"),
          factor_type: "totp" as const,
          status: "unverified" as const,
          created_at: now,
          updated_at: now,
        };
        factors.push(factor);
        const qr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path d="M0 0h3v3H0zM5 0h3v3H5zM0 5h3v3H0zM4 4h1v1H4zM6 5h2v1H6zM5 7h1v1H5z"/></svg>`;
        return send(200, {
          id: factor.id,
          type: "totp",
          friendly_name: factor.friendly_name,
          totp: {
            // Supabase sends bare SVG; supabase-js adds the data: prefix.
            qr_code: qr,
            secret: "JIMDEVSTACKTOTPSECRET",
            uri: "otpauth://totp/Jim:dev?secret=JIMDEVSTACKTOTPSECRET",
          },
        });
      }
      const factor = factors.find((candidate) => candidate.id === factorId);
      if (!factor) return fail(404, "mfa_factor_not_found", "Factor not found");
      if (!action && request.method === "DELETE") {
        factors.splice(factors.indexOf(factor), 1);
        return send(200, { id: factor.id });
      }
      if (action === "challenge") {
        return send(200, {
          id: randomUUID(),
          type: "totp",
          expires_at: Math.floor(Date.now() / 1000) + 300,
        });
      }
      if (action === "verify") {
        if (!/^\d{6}$/.test(String(body.code ?? ""))) {
          return fail(422, "mfa_verification_failed", "Invalid TOTP code entered");
        }
        factor.status = "verified";
        return send(200, session("aal2"));
      }
    }
    if (url.pathname === "/auth/v1/logout") {
      response.writeHead(204);
      response.end();
      return;
    }
    return fail(404, "not_found", `The dev stack's auth stand-in has no ${url.pathname}`);
  }

  const server = createServer((request, response) => {
    handle(request, response).catch((error) => {
      console.error("[fake-auth]", error);
      response.writeHead(500);
      response.end();
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () =>
      resolve(() => new Promise<void>((done) => server.close(() => done()))),
    );
  });
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}
