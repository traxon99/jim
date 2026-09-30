/**
 * An iOS-style toggle switch for a checkbox (issue #333): pair it with
 * `role="switch"` on an `<input type="checkbox">`. The knob uses the accent's
 * foreground when on, so it stays visible with every accent theme,
 * including the default one that follows the text colour.
 */
export const SWITCH_CLASS =
  "relative h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full bg-zinc-300 transition-colors checked:bg-accent disabled:opacity-50 dark:bg-zinc-700 before:absolute before:top-0.5 before:left-0.5 before:h-6 before:w-6 before:rounded-full before:bg-white before:shadow before:transition-transform before:content-[''] checked:before:translate-x-5 checked:before:bg-accent-foreground";
