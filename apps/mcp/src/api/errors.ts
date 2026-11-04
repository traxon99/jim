import type { V1ErrorCode } from "@jim/core";
import type { Response } from "express";

/** A deliberate /v1 failure with its status and code (ADR-022). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: V1ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function notFound(message: string): ApiError {
  return new ApiError(404, "not_found", message);
}

/** Writes the one /v1 error shape. Errors are never cached. */
export function sendError(res: Response, status: number, code: V1ErrorCode, message: string) {
  res.set("Cache-Control", "no-store").status(status).json({ error: { code, message } });
}
