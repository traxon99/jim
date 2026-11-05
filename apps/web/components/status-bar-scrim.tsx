/**
 * A solid band over the status bar / notch, in the page color. Purely
 * visual, styled by .status-bar-scrim in globals.css. It's opaque and takes
 * hits so iOS 26 extends its color instead of drawing its own scroll-edge
 * blur down over the page header (#772).
 */
export function StatusBarScrim() {
  return <div aria-hidden="true" className="status-bar-scrim" />;
}
