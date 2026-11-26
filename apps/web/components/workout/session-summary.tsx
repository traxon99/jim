"use client";

import { AchievementBadge } from "@/components/achievements/achievement-badge";
import { CallMark } from "@/components/dpr/call-mark";
import { ExerciseNameButton } from "@/components/exercises/exercise-name-button";
import { PostToFriendsButton } from "@/components/friends/post-to-friends-button";
import { Send, Share, Star, Trophy, Upload } from "@/components/icons/solar";
import { SECTION_LABEL } from "@/components/page-header";
import { SEGMENTED_TRACK, segmentClass } from "@/components/routines/plan-nav";
import { RoutineIconTileById } from "@/components/routines/routine-icon-by-id";
import { AchievementShareButton } from "@/components/share-card/achievement-share-button";
import { ShareImageButton } from "@/components/share-card/share-image-button";
import { PostWorkoutInsights } from "@/components/workout/post-workout-insights";
import { SaveRoutineChangesCard } from "@/components/workout/save-routine-changes-card";
import { ShareWorkoutButton } from "@/components/workout/share-workout-button";
import { StravaPostRow } from "@/components/workout/strava-post-row";
import {
  type RoutineExerciseRow,
  type SessionExerciseRow,
  type SessionRow,
  type SetRow,
  db,
} from "@/lib/db/schema";
import { dprCallFor } from "@/lib/dpr/calls";
import { useDprContext } from "@/lib/dpr/use-dpr-calls";
import { achievementPostDraft, recordPostDraft, workoutPostDraft } from "@/lib/friends/post-drafts";
import { buildSessionDetailExercises } from "@/lib/history/session-detail-entries";
import { useAchievements } from "@/lib/history/use-achievements";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { showsTempo } from "@/lib/settings/features";
import { type CardExtras, workoutCardInput } from "@/lib/share-card/build";
import { buildWorkoutShareText } from "@/lib/workout/share-text";
import { PR_KIND_LABELS, buildSummaryExerciseRows } from "@/lib/workout/summary-exercises";
import {
  type DprCall,
  type PrKind,
  achievementsEarnedInSession,
  distanceUnitFor,
  isVisiblePr,
  repsAtWeightExerciseIds,
  resolveCurrentRows,
  summarizeSession,
} from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

interface Props {
  session: SessionRow;
  sessionExercises: SessionExerciseRow[];
}

type Tab = "summary" | "insights";

const TILE =
  "press surface flex min-h-16 flex-col items-center justify-center gap-1 text-[13px] font-semibold";

/** PR kinds in the order a highlight prefers them: the e1RM first. */
const PR_ORDER: readonly PrKind[] = ["1rm", "weight", "volume", "reps_at_weight"];

interface PrHighlight {
  exerciseId: string;
  exerciseName: string;
  kind: PrKind;
  value: number;
  /** The record it beat, or null for a first. */
  previous: number | null;
  /** The set that set it, "195 × 8". */
  set: string | null;
}

function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** "10.6k" past 1,000 so four stats fit one strip. */
function compactVolume(volume: number): { value: string; unit: string } {
  if (volume < 1000) return { value: String(Math.round(volume)), unit: "" };
  return { value: (Math.round(volume / 100) / 10).toLocaleString(), unit: "k" };
}

function timeRange(session: SessionRow): string {
  const day = session.startedAt.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = (date: Date) => date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return session.endedAt ? `${day} · ${time(session.startedAt)}–${time(session.endedAt)}` : day;
}

function Stat({
  value,
  unit,
  label,
  gold = false,
}: {
  value: string;
  unit?: string;
  label: string;
  gold?: boolean;
}) {
  return (
    <div className="relative text-center [&+&]:before:absolute [&+&]:before:inset-y-1.5 [&+&]:before:left-0 [&+&]:before:w-px [&+&]:before:bg-zinc-900/10 dark:[&+&]:before:bg-white/10">
      <dd
        className={`text-[22px] leading-tight font-bold tracking-tight tabular-nums ${
          gold ? "text-amber-600 dark:text-amber-400" : ""
        }`}
      >
        {value}
        {unit && (
          <span className="ml-px text-[13px] font-semibold tracking-normal text-zinc-500">
            {unit}
          </span>
        )}
      </dd>
      <dt className="mt-0.5 text-xs font-medium text-zinc-500">{label}</dt>
    </div>
  );
}

/**
 * "Finalize: summary of volume, duration and PRs" (STORIES.md S6), reworked
 * in issue #870: one stat strip, PRs and achievements together, one line per
 * lift with PRP's call for next time, and an Insights tab. Reads entirely
 * from Dexie, so it's there the instant a session ends (docs/ARCHITECTURE.md §1).
 */
export function SessionSummary({ session, sessionExercises }: Props) {
  const [tab, setTab] = useState<Tab>("summary");
  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const sessionExerciseIds = useMemo(() => sessionExercises.map((se) => se.id), [sessionExercises]);

  const rawSets = useLiveQuery(
    () =>
      sessionExerciseIds.length > 0
        ? db.sets.where("sessionExerciseId").anyOf(sessionExerciseIds).toArray()
        : Promise.resolve<SetRow[]>([]),
    [sessionExerciseIds],
  );
  const rawPersonalRecords = useLiveQuery(() => db.personalRecords.toArray(), []);
  const rawExercises = useLiveQuery(() => db.exercises.toArray(), []);
  const routineTargets = useLiveQuery(
    () =>
      session.routineId
        ? db.routineExercises.where("routineId").equals(session.routineId).toArray()
        : Promise.resolve<RoutineExerciseRow[]>([]),
    [session.routineId],
  );
  const dprContext = useDprContext();

  const sets = useMemo(
    () => resolveCurrentRows(rawSets ?? []).filter((set) => !set.deletedAt),
    [rawSets],
  );

  const setIds = useMemo(() => new Set(sets.map((set) => set.id)), [sets]);
  const sessionPrs = useMemo(() => {
    const repsExerciseIds = repsAtWeightExerciseIds(rawExercises ?? []);
    return (rawPersonalRecords ?? []).filter(
      (pr) => !pr.deletedAt && pr.setId && setIds.has(pr.setId) && isVisiblePr(pr, repsExerciseIds),
    );
  }, [rawPersonalRecords, rawExercises, setIds]);

  const summary = useMemo(
    () =>
      summarizeSession(
        sets.map((set) => ({
          weight: set.weight == null ? null : Number(set.weight),
          reps: set.reps,
          kind: set.kind,
        })),
        session.startedAt,
        session.endedAt ?? new Date(),
        sessionPrs.length,
      ),
    [sets, session.startedAt, session.endedAt, sessionPrs.length],
  );

  const exerciseGroups = useMemo(
    () =>
      buildSessionDetailExercises(
        session.id,
        sessionExercises,
        rawExercises ?? [],
        rawSets ?? [],
        rawPersonalRecords ?? [],
      ),
    [session.id, sessionExercises, rawExercises, rawSets, rawPersonalRecords],
  );

  const shareText = useMemo(
    () =>
      buildWorkoutShareText({
        name: session.name,
        startedAt: session.startedAt,
        units: settings.units,
        summary,
        exercises: exerciseGroups,
      }),
    [session.name, session.startedAt, settings.units, summary, exerciseGroups],
  );

  const exerciseRows = useMemo(
    () => buildSummaryExerciseRows(exerciseGroups, distanceUnitFor(settings.units)),
    [exerciseGroups, settings.units],
  );

  // One highlight per lift that set a record: its e1RM if it beat that,
  // else its first kind, with the record it beat.
  const prHighlights = useMemo<PrHighlight[]>(() => {
    const result: PrHighlight[] = [];
    for (const group of exerciseGroups) {
      const prs = sessionPrs
        .filter((pr) => pr.exerciseId === group.exerciseId)
        .sort((a, b) => PR_ORDER.indexOf(a.kind) - PR_ORDER.indexOf(b.kind));
      const pr = prs[0];
      if (!pr) continue;
      const before = (rawPersonalRecords ?? []).filter(
        (other) =>
          !other.deletedAt &&
          other.exerciseId === pr.exerciseId &&
          other.kind === pr.kind &&
          other.achievedAt < pr.achievedAt &&
          !(other.setId && setIds.has(other.setId)),
      );
      const previous = before.length > 0 ? Math.max(...before.map((o) => Number(o.value))) : null;
      const set = group.sets.find((s) => s.id === pr.setId);
      result.push({
        exerciseId: group.exerciseId,
        exerciseName: group.exerciseName,
        kind: pr.kind,
        value: Number(pr.value),
        previous,
        set:
          set?.weight != null && set.reps != null
            ? `${formatNumber(set.weight)} × ${set.reps}`
            : null,
      });
    }
    return result;
  }, [exerciseGroups, sessionPrs, rawPersonalRecords, setIds]);

  const nextCalls = useMemo(() => {
    const calls = new Map<string, { call: DprCall; weight: number | null }>();
    if (!dprContext) return calls;
    for (const row of exerciseRows) {
      const target = routineTargets?.find((t) => t.exerciseId === row.exerciseId && !t.deletedAt);
      const info = dprCallFor(dprContext, row.exerciseId, target ?? null);
      if (info)
        calls.set(row.exerciseId, { call: info.decision.call, weight: info.decision.weight });
    }
    return calls;
  }, [dprContext, exerciseRows, routineTargets]);

  const achievementData = useAchievements();
  const earned = useMemo(
    () =>
      achievementData ? achievementsEarnedInSession(achievementData.achievements, session.id) : [],
    [achievementData, session.id],
  );

  const buildWorkoutCard = useCallback(
    (extras: CardExtras) => ({
      kind: "workout" as const,
      input: workoutCardInput(
        {
          name: session.name,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          units: settings.units,
          groups: exerciseGroups,
        },
        extras,
      ),
    }),
    [session.name, session.startedAt, session.endedAt, settings.units, exerciseGroups],
  );

  const minutes = Math.round(summary.durationSeconds / 60);
  const volume = compactVolume(summary.totalVolume);
  const units = settings.units;
  const prLiftIds = new Set(sessionPrs.map((pr) => pr.exerciseId));

  return (
    <main className="route-fade flex flex-1 flex-col gap-4 px-4 py-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <RoutineIconTileById routineId={session.routineId} />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">
              {session.name ?? "Workout"}
            </h1>
            <p className="truncate text-sm tabular-nums text-zinc-500">{timeRange(session)}</p>
          </div>
        </div>
        <Link
          href="/workout"
          data-ripple
          className="press flex min-h-11 shrink-0 items-center rounded-full bg-accent px-5 text-base font-semibold text-accent-foreground"
        >
          Done
        </Link>
      </header>

      <div className={SEGMENTED_TRACK.replace("grid-cols-3", "grid-cols-2")}>
        {(["summary", "insights"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={segmentClass(tab === value)}
          >
            {value === "summary" ? "Summary" : "Insights"}
          </button>
        ))}
      </div>

      {tab === "insights" ? (
        <PostWorkoutInsights session={session} settings={settings} />
      ) : (
        <>
          <dl className="surface allow-pwa-select grid grid-cols-4 px-1 py-3.5">
            <Stat value={String(minutes)} unit="m" label="Time" />
            <Stat value={volume.value} unit={volume.unit} label={`${units} lifted`} />
            <Stat value={String(summary.setCount)} label="Sets" />
            <Stat
              value={String(summary.prCount)}
              label={summary.prCount === 1 ? "PR" : "PRs"}
              gold={summary.prCount > 0}
            />
          </dl>

          {(prHighlights.length > 0 || earned.length > 0) && (
            <ul
              aria-label="Highlights"
              className="surface allow-pwa-select divide-y divide-zinc-900/10 py-1 dark:divide-white/10"
            >
              {prHighlights.map((pr) => {
                const gain = pr.previous == null ? null : pr.value - pr.previous;
                const amount =
                  pr.kind === "reps_at_weight"
                    ? `${formatNumber(pr.value)} reps`
                    : `${formatNumber(pr.value)} ${units}`;
                return (
                  <li key={pr.exerciseId} className="flex items-center gap-3 py-2.5 pr-1 pl-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-amber-600 dark:text-amber-400">
                      <Trophy className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {pr.exerciseName} {PR_KIND_LABELS[pr.kind]}
                      </p>
                      <p className="truncate text-sm text-zinc-500 tabular-nums">
                        {pr.set && pr.kind !== "weight" ? `${pr.set} · ` : ""}
                        {amount}
                        {gain != null && gain > 0 && (
                          <span className="font-semibold text-done"> +{formatNumber(gain)}</span>
                        )}
                      </p>
                    </div>
                    <PostToFriendsButton
                      draft={recordPostDraft(pr.exerciseName, pr, units)}
                      label={`Post ${pr.exerciseName} record to friends`}
                      className="min-h-11 min-w-11 shrink-0 rounded-full text-zinc-500"
                    >
                      <Send className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                    </PostToFriendsButton>
                  </li>
                );
              })}
              {earned.map((achievement, index) => (
                <li key={achievement.id} className="flex items-center gap-3 py-2.5 pr-1 pl-4">
                  <AchievementBadge
                    achievement={achievement}
                    className="achievement-pop"
                    style={{ animationDelay: `${index * 90}ms` }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{achievement.title}</p>
                    <p className="truncate text-sm text-zinc-500">{achievement.description}</p>
                  </div>
                  <AchievementShareButton
                    achievement={achievement}
                    className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-zinc-500"
                  />
                  <PostToFriendsButton
                    draft={achievementPostDraft(achievement)}
                    label={`Post ${achievement.title} to friends`}
                    className="min-h-11 min-w-11 shrink-0 rounded-full text-zinc-500"
                  >
                    <Send className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                  </PostToFriendsButton>
                </li>
              ))}
            </ul>
          )}

          {exerciseRows.length > 0 && (
            <section aria-label="Exercises" className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between px-1">
                <h2 className={SECTION_LABEL}>Exercises</h2>
                {nextCalls.size > 0 && <span className="text-[13px] text-zinc-500">Next time</span>}
              </div>
              <ul className="surface allow-pwa-select divide-y divide-zinc-900/10 dark:divide-white/10">
                {exerciseRows.map((row) => {
                  const next = nextCalls.get(row.exerciseId);
                  return (
                    <li
                      key={row.sessionExerciseId}
                      className="flex min-h-14 items-center gap-3 px-4 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex min-w-0 items-center gap-1.5 font-semibold">
                          <ExerciseNameButton
                            exerciseId={row.exerciseId}
                            userId={session.userId}
                            className="truncate text-left"
                          >
                            {row.exerciseName}
                          </ExerciseNameButton>
                          {prLiftIds.has(row.exerciseId) && (
                            <Star
                              className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400"
                              strokeWidth={1.75}
                              aria-label="PR"
                            />
                          )}
                        </p>
                        <p className="truncate text-sm text-zinc-500 tabular-nums">
                          {row.setsLine}
                          {row.tempo && showsTempo(settings) && ` · ${row.tempo}`}
                        </p>
                      </div>
                      {next && (
                        <div className="shrink-0 text-right text-[13px] tabular-nums">
                          <CallMark call={next.call} />
                          {next.weight != null && (
                            <p className="text-sm font-semibold">{formatNumber(next.weight)}</p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <SaveRoutineChangesCard session={session} />

          <div className="grid grid-cols-3 gap-2.5">
            <PostToFriendsButton
              draft={workoutPostDraft(session, summary, units)}
              label="Post to friends"
              className={TILE}
            >
              <Send className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden="true" />
              Post
            </PostToFriendsButton>
            <ShareImageButton
              build={buildWorkoutCard}
              title={session.name ?? "Workout"}
              text={shareText}
              routineId={session.routineId}
              on={session.startedAt}
              label="Share image"
              className={TILE}
            >
              <Share className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden="true" />
              Image
            </ShareImageButton>
            <ShareWorkoutButton
              title={session.name ?? "Workout"}
              text={shareText}
              className={TILE}
              icon={<Upload className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden="true" />}
            />
          </div>

          <StravaPostRow session={session} mode="finish" />
        </>
      )}
    </main>
  );
}
