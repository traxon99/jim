import { highlightMatches } from "@jim/core";

/**
 * `text` with the parts that match a search `query` marked (issue #709).
 * Every search result list renders its names through this, so a match reads
 * the same everywhere. An empty query renders the text as is.
 */
export function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return text;
  return highlightMatches(text, query).map((part, index) =>
    part.match ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
      <mark key={index} className="rounded-sm bg-accent/25 text-inherit">
        {part.text}
      </mark>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
      <span key={index}>{part.text}</span>
    ),
  );
}
