import {
  MEASUREMENT_KINDS,
  type MeasurementKind,
  type V1BodyMeasurements,
  displayUnitFor,
} from "@jim/core";
import { z } from "zod";
import type { UserContext } from "../context.js";
import { getBodyMeasurements } from "../tools/get-body-measurements.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 90;

export const bodyQuery = z.object({
  kinds: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value) return ["bodyweight"] as MeasurementKind[];
      const kinds = [...new Set(value.split(",").map((kind) => kind.trim()))];
      for (const kind of kinds) {
        if (!(MEASUREMENT_KINDS as readonly string[]).includes(kind)) {
          ctx.addIssue({
            code: "custom",
            message: `Unknown kind "${kind}"; use ${MEASUREMENT_KINDS.join(", ")}`,
          });
          return z.NEVER;
        }
      }
      return kinds as MeasurementKind[];
    }),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

/**
 * `GET /v1/body-measurements` (#741): the `get_body_measurements` series,
 * converted to the user's units. Every requested kind is listed, so an empty
 * range reads `latest: null, points: []` rather than a 404.
 */
export async function v1BodyMeasurements(
  context: UserContext,
  input: z.infer<typeof bodyQuery>,
  now: Date = new Date(),
): Promise<V1BodyMeasurements> {
  const to = input.to ? new Date(input.to) : now;
  const from = input.from ? new Date(input.from) : new Date(to.getTime() - DEFAULT_DAYS * DAY_MS);
  const { units, measurements } = await getBodyMeasurements(context, {
    kinds: input.kinds,
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const byKind = new Map(measurements.map((series) => [series.kind, series]));
  return {
    measurements: input.kinds.map((kind) => {
      const series = byKind.get(kind);
      const unit = series?.unit ?? displayUnitFor(kind, units);
      const point = (entry: { value: number; measuredAt: string }) => ({
        value: entry.value,
        measuredAt: entry.measuredAt,
      });
      return {
        kind,
        unit,
        latest: series?.latest ? point(series.latest) : null,
        change: series?.change ?? null,
        points: (series?.entries ?? []).map(point),
      };
    }),
  };
}
