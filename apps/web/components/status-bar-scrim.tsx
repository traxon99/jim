/**
 * A translucent, blurred band over the status bar / notch, so content
 * scrolling up under it softens and darkens instead of vanishing behind a
 * solid bar (issue #305). Purely visual — styled by .status-bar-scrim in
 * globals.css, and never intercepts touches.
 */
export function StatusBarScrim() {
  return <div aria-hidden="true" className="status-bar-scrim" />;
}
