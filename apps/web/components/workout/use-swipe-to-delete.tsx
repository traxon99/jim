"use client";

import { swipeDeletes, swipeIntent, swipeOffset } from "@/lib/workout/swipe-to-delete";
import { Trash2 } from "lucide-react";
import { useRef, useState } from "react";

/** How long the row takes to slide away (or back) once the finger lifts. */
const SETTLE_MS = 150;

interface Drag {
  pointerId: number;
  x: number;
  y: number;
  width: number;
  swiping: boolean;
}

/**
 * Swipe a set row left to delete it (issue #350), like Strong's and Hevy's
 * set rows. Spread `rowProps` on the `<tr>` (adding its `className` to the row's own) and put `<SwipeDeleteReveal>`
 * in its last cell (which needs `relative`); the table should sit in an
 * `overflow-x-clip` wrapper so the row can slide out of view.
 *
 * Vertical drags stay scrolls (`touch-action: pan-y`), and a tap never
 * deletes: the row only goes once it's dragged past the threshold. With no
 * `onDelete` the row doesn't swipe.
 */
export function useSwipeToDelete(onDelete: (() => void) | undefined) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);
  // The click that ends a swipe shouldn't also tap whatever was under it.
  const swallowClick = useRef(false);
  const widthRef = useRef(0);

  function end(commit: boolean) {
    drag.current = null;
    setDragging(false);
    if (!commit) {
      setOffset(0);
      return;
    }
    setOffset(-widthRef.current);
    setTimeout(() => {
      onDelete?.();
      // A row that stays mounted (it wasn't removed) slides back into place.
      setOffset(0);
    }, SETTLE_MS);
  }

  const rowProps = {
    // The settle animation is the class's; while dragging the row tracks the
    // finger with no transition.
    className: "transition-transform duration-150 ease-out motion-reduce:transition-none",
    style: {
      transform: offset === 0 ? undefined : `translateX(${offset}px)`,
      transition: dragging ? "none" : undefined,
      touchAction: "pan-y",
    } satisfies React.CSSProperties,
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      if (!onDelete || !event.isPrimary || event.button !== 0) return;
      widthRef.current = event.currentTarget.getBoundingClientRect().width;
      drag.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        width: widthRef.current,
        swiping: false,
      };
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (!current.swiping) {
        const intent = swipeIntent(dx, dy);
        if (intent === "scroll") {
          drag.current = null;
          return;
        }
        if (intent === "undecided") return;
        current.swiping = true;
        swallowClick.current = true;
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      setOffset(swipeOffset(dx, current.width));
    },
    onPointerUp(event: React.PointerEvent<HTMLElement>) {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (!current.swiping) {
        drag.current = null;
        return;
      }
      end(swipeDeletes(swipeOffset(event.clientX - current.x, current.width), current.width));
    },
    onPointerCancel() {
      if (drag.current?.swiping) end(false);
      else drag.current = null;
    },
    onClickCapture(event: React.MouseEvent<HTMLElement>) {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };

  return {
    rowProps,
    /** How much of the delete strip the slid-over row uncovers. */
    reveal: -offset,
    /** Whether letting go now deletes the row. */
    armed: swipeDeletes(offset, widthRef.current),
  };
}

/**
 * The red strip the row uncovers as it slides left, hanging off the right
 * edge of the row's last cell.
 */
export function SwipeDeleteReveal({ reveal, armed }: { reveal: number; armed: boolean }) {
  if (reveal <= 0) return null;
  return (
    <span
      aria-hidden="true"
      style={{ width: reveal }}
      className={`pointer-events-none absolute inset-y-0 left-full flex items-center justify-end overflow-hidden text-sm font-semibold text-white ${
        armed ? "bg-red-600" : "bg-red-400 dark:bg-red-800"
      }`}
    >
      <span className="flex shrink-0 items-center gap-1 px-4">
        <Trash2 className="h-4 w-4" strokeWidth={2} />
        Delete
      </span>
    </span>
  );
}

interface SwipeToDeleteRowProps {
  /** Leave out for a row that doesn't swipe. */
  onDelete?: () => void;
  className?: string;
  /** The row's cells; `reveal` goes in the last one, which needs `relative`. */
  children: (reveal: React.ReactNode) => React.ReactNode;
}

/** A `<tr>` that swipes left to delete, for rows rendered from a loop. */
export function SwipeToDeleteRow({ onDelete, className = "", children }: SwipeToDeleteRowProps) {
  const swipe = useSwipeToDelete(onDelete);
  return (
    <tr {...swipe.rowProps} className={`${className} ${swipe.rowProps.className}`}>
      {children(<SwipeDeleteReveal reveal={swipe.reveal} armed={swipe.armed} />)}
    </tr>
  );
}
