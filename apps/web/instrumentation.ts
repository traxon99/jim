import type { Instrumentation } from "next";

/**
 * Server errors for the admin Failures page (issue #809). Next calls this
 * for every error it captures while handling a request; it is recorded with
 * no user (the request's cookies are never stored) and never throws back.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const [{ recordServerFailure }, { serviceDb }, { APP_VERSION }] = await Promise.all([
      import("./lib/telemetry/server"),
      import("./lib/db/user-scoped"),
      import("./lib/version"),
    ]);
    const err = error instanceof Error ? error : new Error(String(error));
    const digest =
      typeof error === "object" && error !== null && "digest" in error
        ? String((error as { digest: unknown }).digest)
        : undefined;
    await recordServerFailure(serviceDb(), {
      kind: "server_error",
      name: err.name || "Error",
      message: err.message || "(no message)",
      stack: err.stack,
      path: request.path.split("?")[0],
      appVersion: APP_VERSION,
      detail: {
        method: request.method,
        routePath: context.routePath,
        routeType: context.routeType,
        ...(digest ? { digest } : {}),
      },
    });
  } catch (failure) {
    console.error("[telemetry] couldn't record a server error:", failure);
  }
};
