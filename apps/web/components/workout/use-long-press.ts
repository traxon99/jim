"use client";

import { LONG_PRESS_MS, stillPressing } from "@/lib/workout/reorder-drag";
import { useEffect, useRef } from "react";

/** The finger still down when a long press fires, for whatever it picks up. */
export interface LongPressStart {
  pointerId: number;
  clientY: number;
}

interface Press {
  pointerId: number;
  x: number;
  y: number;
  lastY: number;
}

/**
 * Press and hold to pick something up (issue #658): `onLongPress` runs once
 * the finger has rested for `LONG_PRESS_MS` without moving, with the pointer
 * still down so the caller can keep following it. A move first is a scroll
 * and a quick tap is a tap, as before; the click that ends a long press is
 * swallowed so it doesn't also tap the element. Spread the result on the
 * element; with no `onLongPress` it's empty.
 */
export function useLongPress(onLongPress: ((start: LongPressStart) => void) | undefined) {
  const press = useRef<Press | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swallowClick = useRef(false);
  const callback = useRef(onLongPress);
  useEffect(() => {
    callback.current = onLongPress;
  });

  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    press.current = null;
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!onLongPress) return {};

  return {
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      swallowClick.current = false;
      if (!event.isPrimary || event.button !== 0) return;
      cancel();
      press.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        lastY: event.clientY,
      };
      timer.current = setTimeout(() => {
        const current = press.current;
        timer.current = null;
        press.current = null;
        if (!current) return;
        swallowClick.current = true;
        // Android buzzes; iOS has no vibrate and ignores this.
        navigator.vibrate?.(10);
        callback.current?.({ pointerId: current.pointerId, clientY: current.lastY });
      }, LONG_PRESS_MS);
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      const current = press.current;
      if (!current || current.pointerId !== event.pointerId) return;
      current.lastY = event.clientY;
      if (!stillPressing(event.clientX - current.x, event.clientY - current.y)) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onClickCapture(event: React.MouseEvent<HTMLElement>) {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    // A long press in a desktop or Android browser would open its own menu.
    onContextMenu(event: React.MouseEvent<HTMLElement>) {
      event.preventDefault();
    },
  };
}
