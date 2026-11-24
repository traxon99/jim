"use client";

import type { SetTimer } from "@/lib/sessions/use-set-timer";
import type { Tempo } from "@jim/core";
import { useEffect } from "react";
import { type TempoCueStyle, startTempoCues } from "./tempo-cue-player";

/**
 * Plays tempo cues (issue #846) while the set timer counts down to a set or
 * runs it, for the tempo armed by the Start set tap and as many reps as the
 * lift's reps box shows (issue #867; null loops until the set ends). Stops
 * the moment the set is cancelled, ended or logged. Going to the background disarms the set
 * (`onDisarm`): iOS suspends audio there, and resuming mid-rep would call the
 * wrong phase, so the rest of that set runs without cues.
 */
export function useTempoCues(options: {
  timer: Pick<SetTimer, "phase" | "startedAtMs">;
  tempo: Tempo | null;
  reps: number | null;
  style: TempoCueStyle;
  onDisarm: () => void;
}): void {
  const { timer, tempo, reps, style, onDisarm } = options;
  const live = timer.phase === "ready" || timer.phase === "running";
  const startAtMs = timer.startedAtMs;

  useEffect(() => {
    if (!live || !tempo || startAtMs === null) return;
    return startTempoCues({ tempo, reps, style, startAtMs });
  }, [live, tempo, reps, style, startAtMs]);

  useEffect(() => {
    if (!live || !tempo) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") onDisarm();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [live, tempo, onDisarm]);
}
