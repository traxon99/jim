import { reportClientError } from "@/lib/telemetry/client";

// Uncaught errors and unhandled promise rejections anywhere in the app go to
// the admin Failures page (issue #809). Runs before the app's own code.
window.addEventListener("error", (event) => {
  reportClientError(event.error ?? event.message, {
    source: "window",
    ...(event.filename ? { file: event.filename } : {}),
  });
});
window.addEventListener("unhandledrejection", (event) => {
  reportClientError(event.reason, { source: "unhandledrejection" });
});
