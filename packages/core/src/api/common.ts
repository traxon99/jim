import { z } from "zod";

// Response schemas for the /v1 read API (ADR-022). Jackson OS mirrors these
// in its adapter. Within /v1 every change is additive: new optional fields or
// new endpoints only. Anything that would break a reader goes in /v2.

/** Every /v1 error: `{ error: { code, message } }`. */
export const V1_ERROR_CODES = [
  "unauthorized",
  "not_found",
  "bad_request",
  "rate_limited",
  "internal",
] as const;
export type V1ErrorCode = (typeof V1_ERROR_CODES)[number];

export const v1ErrorSchema = z.object({
  error: z.object({ code: z.enum(V1_ERROR_CODES), message: z.string() }),
});
export type V1Error = z.infer<typeof v1ErrorSchema>;

/** An ISO 8601 instant with an offset, as `Date#toISOString` writes it. */
export const v1InstantSchema = z.iso.datetime({ offset: true });
/** A calendar day, `YYYY-MM-DD`, in the user's time zone. */
export const v1DateSchema = z.iso.date();

export const v1UnitsSchema = z.enum(["lb", "kg"]);
