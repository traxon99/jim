import { hashAccessToken, isAccessToken } from "@jim/core";
import type { Db } from "@jim/db";
import express, { type NextFunction, type Request, type Response } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { ZodError, type z } from "zod";
import { resolveAccessToken } from "../auth/access-token.js";
import type { UserContext } from "../context.js";
import { GENERIC_TOOL_ERROR } from "../tool-error.js";
import { ApiError, sendError } from "./errors.js";
import { v1Status } from "./status.js";

/** Requests per token per minute before a 429 (#737). */
export const V1_RATE_LIMIT_PER_MINUTE = 120;
/** Failed sign-ins (401s) per IP per minute before a 429. */
export const V1_FAILED_AUTH_PER_MINUTE = 20;

/**
 * Anything that isn't a deliberate `ApiError` goes out as one generic
 * message, never its own text (which could name env vars or internals, #504);
 * the original is logged.
 */
function sendInternal(res: Response, error: unknown) {
  console.error("/v1 request failed:", error);
  sendError(res, 500, "internal", GENERIC_TOOL_ERROR);
}
const WINDOW_MS = 60_000;

type Handler = (context: UserContext, req: Request) => Promise<unknown>;

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

/** Parses query params with a zod schema; bad input is a 400 with zod's message. */
export function parseQuery<T extends z.ZodType>(schema: T, req: Request): z.infer<T> {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => (issue.path.length ? `${issue.path.join(".")}: ` : "") + issue.message)
      .join("; ");
    throw new ApiError(400, "bad_request", message);
  }
  return result.data;
}

/**
 * The versioned read API for Jackson OS (ADR-022), mounted at `/v1`.
 *
 * Personal access tokens only (either scope); Supabase OAuth tokens aren't
 * accepted. Every handler runs as the token's user under RLS and only reads.
 * One error shape, a per-token rate limit, a short private cache on success
 * and no CORS headers: it's server-to-server only.
 */
export function v1Router(getDb: () => Db): express.Router {
  const router = express.Router();

  const retryAfter = (req: Request, res: Response, windowMs: number) => {
    const resetTime = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
    const seconds = resetTime
      ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : Math.ceil(windowMs / 1000);
    res.set("Retry-After", String(seconds));
    sendError(res, 429, "rate_limited", `Too many requests. Retry in ${seconds}s.`);
  };

  // Before auth, so guessing tokens can't hammer the database: each IP gets
  // a few failed sign-ins a minute. Only 401s count.
  router.use(
    rateLimit({
      windowMs: WINDOW_MS,
      limit: V1_FAILED_AUTH_PER_MINUTE,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      keyGenerator: (req) => `ip:${ipKeyGenerator(req.ip ?? "")}`,
      requestWasSuccessful: (_req, res) => res.statusCode !== 401,
      skipSuccessfulRequests: true,
      handler: (req, res, _next, options) => retryAfter(req, res, options.windowMs),
    }),
  );

  router.use(async (req: Request, res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    if (!token || !isAccessToken(token)) {
      sendError(
        res,
        401,
        "unauthorized",
        "Send a Jim personal access token as Authorization: Bearer jim_pat_…",
      );
      return;
    }
    try {
      const resolved = await resolveAccessToken(getDb(), token);
      if (!resolved) {
        sendError(res, 401, "unauthorized", "The token is invalid, revoked or expired.");
        return;
      }
      const context: UserContext = {
        db: getDb(),
        userId: resolved.userId,
        email: "",
        scope: resolved.scope,
      };
      res.locals.context = context;
      res.locals.tokenKey = `t:${await hashAccessToken(token)}`;
      next();
    } catch (error) {
      sendInternal(res, error);
    }
  });

  // Per token, once it has resolved.
  router.use(
    rateLimit({
      windowMs: WINDOW_MS,
      limit: V1_RATE_LIMIT_PER_MINUTE,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      keyGenerator: (_req, res) => String(res.locals.tokenKey),
      handler: (req, res, _next, options) => retryAfter(req, res, options.windowMs),
    }),
  );

  const get = (path: string, handler: Handler) => {
    router.get(path, async (req, res) => {
      try {
        const body = await handler(res.locals.context as UserContext, req);
        res.set("Cache-Control", "private, max-age=60").json(body);
      } catch (error) {
        if (error instanceof ApiError) {
          sendError(res, error.status, error.code, error.message);
        } else if (error instanceof ZodError) {
          sendError(res, 400, "bad_request", error.message);
        } else {
          sendInternal(res, error);
        }
      }
    });
  };

  get("/status", (context) => v1Status(context));

  router.use((_req, res) => {
    sendError(res, 404, "not_found", "No such endpoint. See docs/API.md.");
  });

  return router;
}
