"use client";

import { CallMark, CallMarkCounts } from "@/components/dpr/call-mark";
import {
  type DprCallInfo,
  type DprContext,
  dprBadge,
  dprBlockProgress,
  dprCallCounts,
  dprCallSummary,
  dprGoalLine,
  dprPlainWhy,
} from "@/lib/dpr/calls";
import { type PrpPopoverPlacement, prpPopoverPlacement } from "@/lib/dpr/popover-placement";
import { exerciseDisplayName } from "@jim/core";
import { ArrowRight, Flag } from "lucide-react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

function formatWeight(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Last time's RPE is an average of the top sets, e.g. 7.33 → "7.3". */
function formatRpe(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** "+10", "−5" or "same" between last time's weight and today's. */
function formatDelta(info: DprCallInfo): string | null {
  const { weight } = info.decision;
  const last = info.decision.last?.weight ?? info.decision.previousWeight;
  if (weight === null || last === null || last === undefined) return null;
  const delta = Math.round((weight - last) * 100) / 100;
  if (delta === 0) return "same";
  return delta > 0 ? `+${formatWeight(delta)}` : `−${formatWeight(-delta)}`;
}

/** Today's RPE target; a light day is already backed off, so it has none. */
function todayRpe(info: DprCallInfo): number | null {
  const { call } = info.decision;
  return call === "light" || call === "insufficient" ? null : info.rpeCap;
}

/**
 * One compact PRP badge for a routine on the Lift tab, e.g. "PRP UP ↑ 2"
 * (issue #284). Tapping it opens a glass popover anchored to the badge
 * (issue #790): the block's week and days left, then each focused lift's
 * last time against today's target.
 */
export function DprWorkoutBadge({
  context,
  calls,
  routineName,
}: {
  context: DprContext;
  calls: readonly DprCallInfo[];
  routineName: string;
}) {
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const anchor = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  const close = useCallback(() => setPhase("closed"), []);
  // Shrinks back into the badge (docs/ANIMATION.md 12, 15); reduced motion
  // just goes, since no animationend would come.
  const requestClose = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPhase("closed");
    else setPhase((was) => (was === "open" ? "closing" : was));
  }, []);
  if (calls.length === 0) return null;

  const summary = dprCallSummary(calls);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => (phase === "open" ? requestClose() : setPhase("open"))}
        aria-expanded={phase === "open"}
        aria-controls={phase === "closed" ? undefined : popoverId}
        aria-label={`PRP details for ${routineName}: ${summary}`}
        className="flex min-h-11 w-fit shrink-0 items-center gap-1.5 rounded-full border border-accent px-2 py-0.5 text-xs font-medium"
      >
        <span className="font-semibold">PRP</span>
        <CallMarkCounts counts={dprCallCounts(calls)} />
      </button>
      {phase !== "closed" && (
        <PrpPopover
          id={popoverId}
          closing={phase === "closing"}
          onClosed={close}
          anchor={anchor}
          context={context}
          calls={calls}
          routineName={routineName}
          onClose={requestClose}
        />
      )}
    </>
  );
}

/**
 * The popover itself, below the badge (above it when there's no room).
 * Portaled to <body> and `fixed`, so the routine rows after it can't paint
 * over it (docs/PWA.md §3, §4). It doesn't dim the page: a tap anywhere
 * else, Escape or a scroll closes it, as with the reaction picker.
 */
function PrpPopover({
  id,
  closing,
  onClosed,
  anchor,
  context,
  calls,
  routineName,
  onClose,
}: {
  id: string;
  /** Playing the exit; `onClosed` unmounts it once that's done. */
  closing: boolean;
  onClosed: () => void;
  anchor: RefObject<HTMLButtonElement | null>;
  context: DprContext;
  calls: readonly DprCallInfo[];
  routineName: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const [place, setPlace] = useState<PrpPopoverPlacement | null>(null);

  useLayoutEffect(() => {
    const badge = anchor.current?.getBoundingClientRect();
    const own = panel.current;
    if (!badge || !own) return;
    setPlace(
      prpPopoverPlacement(badge, own.scrollHeight, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  }, [anchor]);

  // Backstop: iOS drops animationend when an animation is interrupted
  // (LESSONS #356). The exit runs 160ms.
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(onClosed, 300);
    return () => clearTimeout(timer);
  }, [closing, onClosed]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      // The badge toggles the popover itself.
      if (panel.current?.contains(target) || anchor.current?.contains(target)) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onScroll(event: Event) {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  const progress = dprBlockProgress(context.block, context.now);
  const blockEnds = context.block.endsAt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return createPortal(
    // z-20: above in-flow chrome and the tab bar, like FloatingCard (docs/PWA.md §4).
    <section
      ref={panel}
      id={id}
      aria-labelledby={titleId}
      data-closing={closing}
      onAnimationEnd={(event) => {
        if (closing && event.target === event.currentTarget) onClosed();
      }}
      className="prp-popover prp-popover-glass fixed z-20 flex flex-col rounded-[28px]"
      style={
        place
          ? {
              top: place.top,
              left: place.left,
              width: place.width,
              maxHeight: place.maxHeight,
              transformOrigin: `${place.tailX}px ${place.below ? "0" : "100%"}`,
            }
          : { top: 0, left: 12, width: "calc(100vw - 24px)", visibility: "hidden" }
      }
    >
      {place && (
        <span
          aria-hidden="true"
          data-side={place.below ? "top" : "bottom"}
          className={`prp-popover-tail absolute h-4 w-4 ${place.below ? "-top-2" : "-bottom-2"}`}
          style={{ left: place.tailX - 8 }}
        />
      )}
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="truncate text-[13px] font-semibold tracking-[0.03em] text-accent uppercase"
          >
            PRP · {routineName}
          </h2>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{progress.label}</span>{" "}
            · ends {blockEnds}
          </p>
        </div>
        <BlockRing fraction={progress.fraction} daysLeft={progress.daysLeft} />
      </div>

      <ul className="allow-pwa-select flex min-h-0 flex-col overflow-y-auto overscroll-contain px-4 pt-3 pb-4">
        {calls.length === 1 ? (
          <LiftDetail info={calls[0] as DprCallInfo} context={context} />
        ) : (
          calls.map((info) => <LiftRow key={info.exerciseId} info={info} context={context} />)
        )}
      </ul>
    </section>,
    document.body,
  );
}

/** Days left in the block, as a ring that fills as the block runs. */
function BlockRing({ fraction, daysLeft }: { fraction: number; daysLeft: number }) {
  const r = 19;
  const length = 2 * Math.PI * r;
  return (
    <span
      role="img"
      aria-label={`${daysLeft} day${daysLeft === 1 ? "" : "s"} left in the block`}
      className="relative grid h-[38px] w-[38px] shrink-0 place-items-center text-accent"
    >
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          strokeWidth="5"
          className="stroke-zinc-900/10 dark:stroke-white/15"
        />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - fraction)}
        />
      </svg>
      <span className="text-[10px] font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
        {daysLeft}d
      </span>
    </span>
  );
}

function liftName(context: DprContext, info: DprCallInfo): string {
  const exercise = context.exercises.get(info.exerciseId);
  return exercise ? exerciseDisplayName(exercise) : "Lift";
}

/** One focused lift: last time and today side by side, why, and the block goal. */
function LiftDetail({ info, context }: { info: DprCallInfo; context: DprContext }) {
  const units = context.settings.units;
  const { decision } = info;
  const badge = dprBadge(decision.call);
  const last = decision.last ?? null;
  const delta = formatDelta(info);
  const rpe = todayRpe(info);
  const goal = dprGoalLine(context, info.exerciseId);

  return (
    <li className="flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <span className="line-clamp-2 min-w-0 text-[19px] leading-tight font-bold tracking-[-0.022em]">
          {liftName(context, info)}
        </span>
        <span
          className={`shrink-0 rounded-full border-[1.5px] px-2 py-0.5 text-[13px] ${badge.className}`}
        >
          <CallMark call={decision.call} inherit />
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <div className="rounded-2xl bg-white p-3 dark:bg-zinc-800">
          <p className="text-[11px] font-semibold tracking-[0.05em] text-zinc-500 uppercase dark:text-zinc-400">
            Last time
          </p>
          {last ? (
            <>
              <p className="mt-1 text-[28px] leading-tight font-bold tracking-[-0.03em] text-zinc-500 tabular-nums dark:text-zinc-400">
                {formatWeight(last.weight)}
                <span className="text-[15px] font-medium tracking-normal"> {units}</span>
              </p>
              <p className="text-[13px] text-zinc-500 tabular-nums dark:text-zinc-400">
                {last.sets > 1 ? `${last.sets} × ${last.reps}` : `× ${last.reps}`}
                {last.rpe !== null && ` · RPE ${formatRpe(last.rpe)}`}
              </p>
            </>
          ) : (
            <p className="mt-1 text-[15px] text-zinc-500 dark:text-zinc-400">No history yet</p>
          )}
        </div>

        <div
          className={`flex flex-col items-center justify-center gap-0.5 ${badge.textClassName}`}
          aria-hidden={delta === null}
        >
          <ArrowRight className="h-[22px] w-[22px]" strokeWidth={2.4} aria-hidden="true" />
          {delta !== null && (
            <span className="text-[13px] font-bold tabular-nums">
              <span className="sr-only">Change: </span>
              {delta}
            </span>
          )}
        </div>

        <div className={`rounded-2xl p-3 ring-[1.5px] ring-inset ${badge.softClassName}`}>
          <p
            className={`text-[11px] font-semibold tracking-[0.05em] uppercase ${badge.textClassName}`}
          >
            Today
          </p>
          <p className="mt-1 text-[28px] leading-tight font-bold tracking-[-0.03em] tabular-nums">
            {decision.weight === null ? "—" : formatWeight(decision.weight)}
            {decision.weight !== null && (
              <span className="text-[15px] font-medium tracking-normal text-zinc-500 dark:text-zinc-400">
                {" "}
                {units}
              </span>
            )}
          </p>
          <p className="text-[13px] text-zinc-500 tabular-nums dark:text-zinc-400">
            {decision.targetReps !== null && `× ${decision.targetReps}`}
            {decision.targetReps !== null && rpe !== null && " · "}
            {rpe !== null && `RPE ${formatWeight(rpe)}`}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{dprPlainWhy(decision)}</p>
      {goal && (
        <p className="mt-3 flex items-center gap-2 border-t border-zinc-900/10 pt-2.5 text-[13px] text-zinc-500 dark:border-white/10 dark:text-zinc-400">
          <Flag className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          {goal.text}
        </p>
      )}
    </li>
  );
}

/** With several focused lifts, one compact row each: name, call, last → today. */
function LiftRow({ info, context }: { info: DprCallInfo; context: DprContext }) {
  const units = context.settings.units;
  const { decision } = info;
  const badge = dprBadge(decision.call);
  const last = decision.last ?? null;
  const delta = formatDelta(info);
  const rpe = todayRpe(info);
  return (
    <li className="flex items-center gap-3 border-zinc-900/10 py-2.5 not-first:border-t dark:border-white/10">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-base font-semibold tracking-[-0.015em]">
          <span className="truncate">{liftName(context, info)}</span>
          <CallMark call={decision.call} className="text-xs" />
        </p>
        <p className="text-[13px] text-zinc-500 tabular-nums dark:text-zinc-400">
          {last
            ? `Last ${formatWeight(last.weight)} × ${last.reps}${last.rpe !== null ? ` @ ${formatRpe(last.rpe)}` : ""}`
            : "No history yet"}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[17px] font-bold tracking-[-0.02em] tabular-nums">
          {decision.weight === null ? "—" : formatWeight(decision.weight)}
          <span className="text-[13px] font-medium text-zinc-500 dark:text-zinc-400"> {units}</span>
          {decision.targetReps !== null && ` × ${decision.targetReps}`}
        </p>
        <p className="text-xs tabular-nums">
          {delta !== null && (
            <span className={`font-semibold ${badge.textClassName}`}>{delta}</span>
          )}
          {rpe !== null && (
            <span className="text-zinc-500 dark:text-zinc-400"> · RPE {formatWeight(rpe)}</span>
          )}
        </p>
      </div>
    </li>
  );
}
