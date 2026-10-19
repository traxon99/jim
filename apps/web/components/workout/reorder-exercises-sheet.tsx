"use client";

import { SupersetBadge } from "@/components/supersets/superset-badge";
import { REORDER_ROW_PX, dropIndex, edgeScrollSpeed, moveId } from "@/lib/workout/reorder-drag";
import { GripVertical } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LongPressStart } from "./use-long-press";

export interface ReorderSheetItem {
  id: string;
  name: string;
  /** "A1"-style place in a superset, or null. */
  supersetLabel: string | null;
}

interface Props {
  items: readonly ReorderSheetItem[];
  /** The row a long press picked up, still under the finger; null when opened from a menu. */
  initialDrag: (LongPressStart & { id: string }) | null;
  /** Saves a new order, every id in it. */
  onReorder: (orderedIds: string[]) => void;
  onClose: () => void;
}

interface Drag {
  id: string;
  pointerId: number;
  clientY: number;
  /** The finger's y inside the list's content; null until the list is measured. */
  contentY: number | null;
  /** How far below the row's top edge the finger holds it. */
  grabOffset: number;
}

/**
 * The workout condensed to its exercise names, to drag into a new order
 * (issue #658). A long press on an exercise name opens it with that
 * exercise already following the finger; letting go saves the order and
 * leaves the list open for another move, until Done.
 *
 * Every row has the same height, so the slot under the finger is a
 * division. Rows are `touch-none` and pick up straight away; the list only
 * scrolls when it's taller than the screen, and then a row held near the
 * top or bottom edge scrolls it (docs/PWA.md §2 for the overlay rules).
 */
export function ReorderExercisesSheet({ items, initialDrag, onReorder, onClose }: Props) {
  const ids = items.map((item) => item.id);
  // The order just saved, until the live query catches up with it.
  const [savedOrder, setSavedOrder] = useState<string[] | null>(null);
  const order =
    savedOrder && savedOrder.length === ids.length && savedOrder.every((id) => ids.includes(id))
      ? savedOrder
      : ids;
  const [drag, setDrag] = useState<Drag | null>(
    initialDrag
      ? {
          id: initialDrag.id,
          pointerId: initialDrag.pointerId,
          clientY: initialDrag.clientY,
          contentY: null,
          grabOffset: REORDER_ROW_PX / 2,
        }
      : null,
  );
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLOListElement>(null);
  const latest = useRef({ drag, order, onReorder });
  useEffect(() => {
    latest.current = { drag, order, onReorder };
  });

  const byId = new Map(items.map((item) => [item.id, item]));
  const count = order.length;
  const maxTop = Math.max(0, (count - 1) * REORDER_ROW_PX);

  function rowTop(current: Drag): number | null {
    if (current.contentY == null) return null;
    return Math.min(Math.max(current.contentY - current.grabOffset, 0), maxTop);
  }

  // The finger's position inside the list, re-measured whenever it moves or
  // the list scrolls under it.
  function follow(clientY: number) {
    const content = contentRef.current;
    if (!content) return;
    const contentY = clientY - content.getBoundingClientRect().top;
    setDrag((current) => (current ? { ...current, clientY, contentY } : current));
  }

  // The long press's finger is already down: place the row under it before
  // the first paint.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, on opening
  useLayoutEffect(() => {
    const current = latest.current.drag;
    if (current && current.contentY == null) follow(current.clientY);
  }, []);

  function save(next: string[]) {
    const { order: before, onReorder: save } = latest.current;
    if (next.join(",") === before.join(",")) return;
    setSavedOrder(next);
    save(next);
  }

  const dragging = drag !== null;
  const dragPointerId = drag?.pointerId;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `follow`, `rowTop` and `save` read the rest through `latest`
  useEffect(() => {
    if (!dragging) return;
    function onPointerMove(event: PointerEvent) {
      if (event.pointerId !== dragPointerId) return;
      follow(event.clientY);
    }
    function onPointerUp(event: PointerEvent) {
      if (event.pointerId !== dragPointerId) return;
      const { drag: current, order: currentOrder } = latest.current;
      setDrag(null);
      const top = current ? rowTop(current) : null;
      if (!current || top == null) return;
      save(moveId(currentOrder, current.id, dropIndex(top, currentOrder.length)));
    }
    function onPointerCancel(event: PointerEvent) {
      if (event.pointerId === dragPointerId) setDrag(null);
    }
    // The finger that started on an exercise name would otherwise go on to
    // scroll the workout behind the sheet.
    function onTouchMove(event: TouchEvent) {
      if (event.cancelable) event.preventDefault();
    }
    // Held near an edge of a list taller than the screen, the list scrolls.
    let frame = requestAnimationFrame(function step() {
      const current = latest.current.drag;
      const scroller = scrollerRef.current;
      if (current && scroller) {
        const rect = scroller.getBoundingClientRect();
        const speed = edgeScrollSpeed(current.clientY, rect.top, rect.bottom);
        if (speed !== 0) {
          const before = scroller.scrollTop;
          scroller.scrollTop += speed;
          if (scroller.scrollTop !== before) follow(current.clientY);
        }
      }
      frame = requestAnimationFrame(step);
    });
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [dragging, dragPointerId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Same lock as Focus view: `fixed` alone leaves the page behind scrollable.
  useEffect(() => {
    const html = document.documentElement;
    const { body } = document;
    const previous = { html: html.style.overflow, body: body.style.overflow };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = previous.html;
      body.style.overflow = previous.body;
    };
  }, []);

  const draggedTop = drag ? rowTop(drag) : null;
  const preview =
    drag && draggedTop != null ? moveId(order, drag.id, dropIndex(draggedTop, count)) : order;

  function startDrag(event: React.PointerEvent<HTMLLIElement>, id: string) {
    if (!event.isPrimary || event.button !== 0 || drag) return;
    const content = contentRef.current;
    if (!content) return;
    const contentY = event.clientY - content.getBoundingClientRect().top;
    setDrag({
      id,
      pointerId: event.pointerId,
      clientY: event.clientY,
      contentY,
      grabOffset: contentY - order.indexOf(id) * REORDER_ROW_PX,
    });
  }

  function moveByKey(event: React.KeyboardEvent<HTMLLIElement>, id: string) {
    const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (step === 0) return;
    event.preventDefault();
    save(moveId(order, id, order.indexOf(id) + step));
  }

  return createPortal(
    // z-30: above Focus view (z-20), which a long press can open this from,
    // and the rest timer bar (z-10); portaled out of the workout's scroller.
    <section
      aria-label="Reorder exercises"
      className="route-fade fixed inset-0 z-30 flex flex-col overscroll-none bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <header className="flex shrink-0 touch-none items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Reorder exercises</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">Drag an exercise to move it</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Done
        </button>
      </header>

      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <ol
          ref={contentRef}
          aria-label="Exercises"
          className="relative"
          style={{ height: count * REORDER_ROW_PX }}
        >
          {order.map((id) => {
            const item = byId.get(id);
            if (!item) return null;
            const held = drag?.id === id;
            const top =
              held && draggedTop != null ? draggedTop : preview.indexOf(id) * REORDER_ROW_PX;
            return (
              <li
                key={id}
                // biome-ignore lint/a11y/noNoninteractiveTabindex: arrow keys move the focused row
                tabIndex={0}
                aria-label={`${item.name}, ${order.indexOf(id) + 1} of ${count}. Arrow keys move it.`}
                onPointerDown={(event) => startDrag(event, id)}
                onKeyDown={(event) => moveByKey(event, id)}
                className={`absolute inset-x-0 top-0 flex touch-none items-center py-1 ${
                  held
                    ? "z-10"
                    : "transition-transform duration-150 ease-out motion-reduce:transition-none"
                }`}
                style={{ height: REORDER_ROW_PX, transform: `translateY(${top}px)` }}
              >
                <div
                  className={`flex h-full w-full min-w-0 items-center gap-2 rounded-lg border bg-white px-3 dark:bg-zinc-900 ${
                    held
                      ? "scale-[1.02] border-accent shadow-lg"
                      : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  <GripVertical
                    className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  {item.supersetLabel && <SupersetBadge label={item.supersetLabel} />}
                  <span className="min-w-0 truncate text-base font-medium">{item.name}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>,
    document.body,
  );
}
