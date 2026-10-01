/**
 * Supersets (issue #228). A superset is a run of neighbouring exercises —
 * in display order — that share the same non-null `supersetGroup`. The
 * number itself carries no meaning beyond "these belong together"; it's
 * the adjacency that makes a superset, so an item dragged out of the middle
 * of one simply splits it. Every helper here takes items already in display
 * order.
 */
export interface SupersetItem {
  id: string;
  supersetGroup: number | null;
}

export interface SupersetChange {
  id: string;
  supersetGroup: number | null;
}

export interface SupersetBlock<T> {
  /** The block's items, in order — one for a plain exercise. */
  items: T[];
  /** "A", "B", … for supersets, counting only supersets; null otherwise. */
  letter: string | null;
}

/** `links[i]` is whether item `i` is supersetted with item `i + 1`. */
export function supersetLinks(items: readonly SupersetItem[]): boolean[] {
  const links: boolean[] = [];
  for (let i = 0; i < items.length - 1; i++) {
    const group = items[i]?.supersetGroup ?? null;
    links.push(group != null && group === (items[i + 1]?.supersetGroup ?? null));
  }
  return links;
}

/** Group numbers from links: runs of two or more get 1, 2, …; singles get null. */
function groupsFromLinks(links: readonly boolean[], count: number): (number | null)[] {
  const groups: (number | null)[] = [];
  let next = 0;
  let current: number | null = null;
  for (let i = 0; i < count; i++) {
    const linkedToPrevious = i > 0 && links[i - 1] === true;
    const linkedToNext = links[i] === true;
    if (!linkedToPrevious) current = linkedToNext ? ++next : null;
    groups.push(current);
  }
  return groups;
}

function changesFor(
  items: readonly SupersetItem[],
  groups: readonly (number | null)[],
): SupersetChange[] {
  const changes: SupersetChange[] = [];
  items.forEach((item, i) => {
    const supersetGroup = groups[i] ?? null;
    if (item.supersetGroup !== supersetGroup) changes.push({ id: item.id, supersetGroup });
  });
  return changes;
}

/**
 * Takes the item at `index` out of its superset by unlinking it from both
 * neighbours. Returns only the items whose `supersetGroup` changes.
 */
export function leaveSuperset(items: readonly SupersetItem[], index: number): SupersetChange[] {
  if (index < 0 || index >= items.length) return [];
  const links = supersetLinks(items);
  if (index > 0) links[index - 1] = false;
  if (index < links.length) links[index] = false;
  return changesFor(items, groupsFromLinks(links, items.length));
}

/**
 * A group number no item uses yet, for exercises added together as a new
 * superset (picked together in the exercise picker, issue #269).
 */
export function nextSupersetGroup(items: readonly SupersetItem[]): number {
  let max = 0;
  for (const item of items) max = Math.max(max, item.supersetGroup ?? 0);
  return max + 1;
}

/**
 * Renumbers groups to match the current adjacency — after a reorder, a
 * superset split in two gets two groups and a lone leftover member is
 * cleared, so the stored numbers never claim a link the list doesn't show.
 */
export function normalizeSupersets(items: readonly SupersetItem[]): SupersetChange[] {
  return changesFor(items, groupsFromLinks(supersetLinks(items), items.length));
}

/**
 * Makes the picked items one superset (issue #360): they move together to
 * where the first of them sits, keeping their order, and everything else
 * keeps its order around them. `editingIds` are the members of the superset
 * being edited, if any — the ones no longer picked leave it. Groups are
 * renumbered to match the new adjacency, so a superset the move splits or
 * strands is cleaned up too. Returns every item in its new order; fewer
 * than two picked changes nothing.
 */
export function formSuperset<T extends SupersetItem>(
  items: readonly T[],
  selectedIds: readonly string[],
  editingIds: readonly string[] = [],
): T[] {
  const selected = new Set(selectedIds);
  const picked = items.filter((item) => selected.has(item.id));
  if (picked.length < 2) return [...items];
  const editing = new Set(editingIds);
  const group = nextSupersetGroup(items);
  const firstIndex = items.findIndex((item) => selected.has(item.id));
  const before: T[] = [];
  const after: T[] = [];
  items.forEach((item, i) => {
    if (selected.has(item.id)) return;
    const kept = editing.has(item.id) ? { ...item, supersetGroup: null } : item;
    (i < firstIndex ? before : after).push(kept);
  });
  const ordered = [
    ...before,
    ...picked.map((item) => ({ ...item, supersetGroup: group })),
    ...after,
  ];
  const groups = groupsFromLinks(supersetLinks(ordered), ordered.length);
  return ordered.map((item, i) => {
    const supersetGroup = groups[i] ?? null;
    return item.supersetGroup === supersetGroup ? item : { ...item, supersetGroup };
  });
}

/** Splits items into display blocks: each superset together, everything else alone. */
export function supersetBlocks<T extends SupersetItem>(items: readonly T[]): SupersetBlock<T>[] {
  const links = supersetLinks(items);
  const blocks: SupersetBlock<T>[] = [];
  let letters = 0;
  items.forEach((item, i) => {
    if (i > 0 && links[i - 1]) {
      blocks[blocks.length - 1]?.items.push(item);
      return;
    }
    const isSuperset = links[i] === true;
    blocks.push({
      items: [item],
      letter: isSuperset ? supersetLetter(letters++) : null,
    });
  });
  return blocks;
}

function supersetLetter(index: number): string {
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/**
 * "A1", "A2", "B1", … for each item in a superset, keyed by id. Plain
 * exercises aren't in the map.
 */
export function supersetLabels(items: readonly SupersetItem[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const block of supersetBlocks(items)) {
    if (!block.letter) continue;
    block.items.forEach((item, i) => labels.set(item.id, `${block.letter}${i + 1}`));
  }
  return labels;
}

export interface SupersetFollowUp {
  /** Whether to start the rest timer — only once a round of the superset is done. */
  rest: boolean;
  /** The exercise to do next within the superset, or null to carry on as usual. */
  nextId: string | null;
}

/**
 * What comes after logging a set of `id` in a workout: in a superset, go
 * straight to the next exercise in the round that still has sets left, with
 * no rest in between; once the round is done, rest and start the next round
 * back at the first unfinished member. Outside a superset, just rest.
 * `isComplete` should already count the set just logged.
 */
export function supersetFollowUp(
  items: readonly SupersetItem[],
  id: string,
  isComplete: (id: string) => boolean,
): SupersetFollowUp {
  const block = supersetBlocks(items).find((b) => b.items.some((item) => item.id === id));
  if (!block || block.items.length < 2) return { rest: true, nextId: null };
  const position = block.items.findIndex((item) => item.id === id);
  const laterInRound = block.items.slice(position + 1).find((item) => !isComplete(item.id));
  if (laterInRound) return { rest: false, nextId: laterInRound.id };
  const nextRound = block.items.find((item) => !isComplete(item.id));
  return { rest: true, nextId: nextRound?.id ?? null };
}
