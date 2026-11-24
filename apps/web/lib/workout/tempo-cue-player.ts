"use client";

import { type Tempo, type TempoCue, tempoCueSchedule, tempoSetCues } from "@jim/core";

/**
 * Tempo cues (issue #846): plays a tempo's cues, one per second, from a
 * start time until stopped. Tones come from Web Audio, scheduled on its own
 * clock so the seconds don't drift; words come from the platform's speech
 * synthesis. Nothing to download or cache.
 *
 * iOS only lets a page make sound after a tap, so `unlockTempoCueAudio` must
 * run inside the Start set tap. The audio session is "ambient": cues mix
 * with the lifter's music instead of pausing it, and like any ambient audio
 * they follow the ring/silent switch (docs/PWA.md). The session type is
 * page-wide, so stopping the cues puts back the type it had before, and the
 * rest alert's beep keeps behaving as it always has.
 */

export type TempoCueStyle = "voice" | "sounds";

const WORDS: Record<Exclude<TempoCue, "tick">, string> = {
  down: "Down",
  pause: "Pause",
  up: "Up",
  between: "Reset",
};

/** How far ahead tones are put on the audio clock. */
const LOOKAHEAD_MS = 1200;
const SCHEDULER_INTERVAL_MS = 250;

let context: AudioContext | null = null;
/** The audio session type before cues set "ambient"; undefined when cues haven't changed it. */
let previousSessionType: string | undefined;

interface NavigatorWithAudioSession {
  audioSession?: { type: string };
}

function audioContext(): AudioContext | null {
  if (context) return context;
  const Constructor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) return null;
  try {
    context = new Constructor();
  } catch {
    return null;
  }
  return context;
}

function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Call from the Start set tap: wakes audio and speech while iOS still counts it as user-started. */
/** Mixes with other apps' audio while cues play; restored by `restoreAudioSession`. */
function enterAmbientSession(): void {
  try {
    const session = (navigator as NavigatorWithAudioSession).audioSession;
    if (session && session.type !== "ambient") {
      previousSessionType ??= session.type;
      session.type = "ambient";
    }
  } catch {
    // Older Safari: no audio session API; cues play with the default session.
  }
}

export function unlockTempoCueAudio(style: TempoCueStyle): void {
  enterAmbientSession();
  const ctx = audioContext();
  if (ctx && ctx.state !== "running") void ctx.resume().catch(() => {});
  if (style === "voice" && speechAvailable()) {
    try {
      // A silent utterance inside the tap lets later ones play on iOS.
      const utterance = new SpeechSynthesisUtterance("");
      utterance.volume = 0;
      window.speechSynthesis.speak(utterance);
    } catch {
      // No speech: cues fall back to sounds.
    }
  }
}

function restoreAudioSession(): void {
  if (previousSessionType === undefined) return;
  try {
    const session = (navigator as NavigatorWithAudioSession).audioSession;
    if (session) session.type = previousSessionType;
  } catch {
    // Nothing to restore.
  }
  previousSessionType = undefined;
}

function playTone(
  ctx: AudioContext,
  at: number,
  from: number,
  to: number,
  duration: number,
  volume: number,
  live: Set<OscillatorNode>,
) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.frequency.setValueAtTime(from, at);
  if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, at + duration);
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.onended = () => live.delete(oscillator);
  live.add(oscillator);
  oscillator.start(at);
  oscillator.stop(at + duration);
}

/**
 * The sound effect for a cue: falling for down, a double beep for pause,
 * rising for up, one low beep for the time between reps, a click for a tick.
 */
function playSound(ctx: AudioContext, cue: TempoCue, at: number, live: Set<OscillatorNode>) {
  switch (cue) {
    case "tick":
      playTone(ctx, at, 1800, 1800, 0.04, 0.15, live);
      break;
    case "down":
      playTone(ctx, at, 700, 380, 0.25, 0.3, live);
      break;
    case "pause":
      playTone(ctx, at, 520, 520, 0.09, 0.3, live);
      playTone(ctx, at + 0.13, 520, 520, 0.09, 0.3, live);
      break;
    case "up":
      playTone(ctx, at, 420, 900, 0.25, 0.3, live);
      break;
    case "between":
      playTone(ctx, at, 330, 330, 0.18, 0.25, live);
      break;
  }
}

function speak(word: string): boolean {
  if (!speechAvailable()) return false;
  try {
    const synth = window.speechSynthesis;
    if (synth.getVoices().length === 0) return false;
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.rate = 1.2;
    synth.cancel();
    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

/**
 * Plays `tempo`'s cues, the first one at `startAtMs` (ms since epoch, may be
 * ahead: the get-ready countdown), for `reps` reps (issue #867), or on a loop
 * when `reps` is null. Returns a function that stops everything at once.
 */
export function startTempoCues(options: {
  tempo: Tempo;
  reps: number | null;
  style: TempoCueStyle;
  startAtMs: number;
}): () => void {
  const ctx = audioContext();
  const set = tempoSetCues(options.tempo, options.reps);
  const cues = set ?? tempoCueSchedule(options.tempo);
  if (!ctx || cues.length === 0) return () => {};
  // Again here, not only in the tap: skipping the countdown restarts the player.
  enterAmbientSession();
  const live = new Set<OscillatorNode>();
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  // The next second to schedule, counted from startAtMs. Skip any already past.
  let next = Math.max(0, Math.ceil((Date.now() - options.startAtMs) / 1000));

  const schedule = () => {
    const now = Date.now();
    while (options.startAtMs + next * 1000 < now + LOOKAHEAD_MS && (!set || next < set.length)) {
      const beatMs = options.startAtMs + next * 1000;
      const cue = cues[next % cues.length] ?? "tick";
      const delayMs = beatMs - now;
      next++;
      if (delayMs < -100) continue;
      if (cue !== "tick" && options.style === "voice") {
        const word = WORDS[cue];
        const timeout = setTimeout(
          () => {
            timeouts.delete(timeout);
            if (!speak(word)) playSound(ctx, cue, ctx.currentTime, live);
          },
          Math.max(0, delayMs),
        );
        timeouts.add(timeout);
      } else {
        playSound(ctx, cue, ctx.currentTime + Math.max(0, delayMs) / 1000, live);
      }
    }
  };

  schedule();
  const interval = setInterval(schedule, SCHEDULER_INTERVAL_MS);

  return () => {
    clearInterval(interval);
    for (const timeout of timeouts) clearTimeout(timeout);
    timeouts.clear();
    for (const oscillator of live) {
      try {
        oscillator.stop();
      } catch {
        // Already stopped.
      }
    }
    live.clear();
    if (options.style === "voice" && speechAvailable()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Nothing to cancel.
      }
    }
    restoreAudioSession();
  };
}
