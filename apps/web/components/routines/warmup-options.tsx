import type { RoutineRow } from "@/lib/db/schema";
import { WARMUP_TEMPLATES } from "@jim/core";

/**
 * The options of a warm-up `<select>` (issue #552): None, the user's own
 * warm-ups as `routine:<id>`, then the built-in templates as
 * `template:<key>`. Shared by the routine form and the program editor.
 */
export function WarmupOptions({ warmupRoutines }: { warmupRoutines: RoutineRow[] }) {
  return (
    <>
      <option value="">None</option>
      {warmupRoutines.length > 0 && (
        <optgroup label="My warm-ups">
          {warmupRoutines.map((warmup) => (
            <option key={warmup.id} value={`routine:${warmup.id}`}>
              {warmup.name}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Templates">
        {WARMUP_TEMPLATES.map((template) => (
          <option key={template.key} value={`template:${template.key}`}>
            {template.name}
          </option>
        ))}
      </optgroup>
    </>
  );
}
