"use client";

import type { SetTimer } from "@/lib/sessions/use-set-timer";
import type { Tempo } from "@jim/core";
import { useEffect } from "react";
import { type TempoCueStyle, startTempoCues } from "./tempo-cue-player";

/**
 * Plays tempo cues (issue #846) while the set timer counts down to a set or
 * runs it, for the tempo armed by the Start set tap. Stops the moment the
 * set is cancelled, ended or logged. Going to the background disarms the set
 * (`onDisarm`): iOS suspends audio there, and resuming mid-rep would call the
 * wrong phase, so the rest of that set runs without cues.
 */
export function useTempoCues(options: {
  timer: Pick<SetTimer, "phase" | "startedAtMs">;
  tempo: Tempo | null;
  style: TempoCueStyle;
  onDisarm: () => void;
}): void {
  const { timer, tempo, style, onDisarm } = options;
  const live = timer.phase === "ready" || timer.phase === "running";
  const startAtMs = timer.startedAtMs;

  useEffect(() => {
    if (!live || !tempo || startAtMs === null) return;
    return startTempoCues({ tempo, style, startAtMs });
  }, [live, tempo, style, startAtMs]);

  useEffect(() => {
    if (!live || !tempo) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") onDisarm();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [live, tempo, onDisarm]);
}
