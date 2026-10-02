"use client";

import { useLayoutEffect } from "react";
import { registerBootTask } from "./ready";

/**
 * Holds the boot splash up for as long as `pending` is true and this
 * component is mounted (and visible: a hidden `<Activity>` tab unmounts its
 * effects, so only what's on screen counts). A layout effect, so the task is
 * registered in the same commit that first shows the pending state, before any
 * passive effect could see an empty task list. Once boot has been revealed
 * this is a no-op in practice: the gate latches (lib/boot/gate.ts).
 */
export function useBootTask(pending: boolean): void {
  useLayoutEffect(() => {
    if (!pending) return;
    return registerBootTask();
  }, [pending]);
}
