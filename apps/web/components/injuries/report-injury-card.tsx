"use client";

import { BodyMap } from "@/components/exercises/body-map";
import { FloatingCard } from "@/components/floating-card";
import { INJURY_NOTE_MAX, cleanInjuryInput, reportInjury } from "@/lib/injuries";
import { useTodayKey } from "@/lib/injuries/use-injuries";
import {
  INJURY_SIDES,
  type InjurySide,
  JOINTS,
  MUSCLES,
  type MuscleShading,
  areaMuscles,
  capitalizeArea,
  injuryAreaLabel,
  isPairedArea,
} from "@jim/core";
import { useRef, useState } from "react";
import { PainPicker } from "./pain-picker";

const SIDE_LABELS: Record<InjurySide, string> = { left: "Left", right: "Right", both: "Both" };

/**
 * Report an injury (issue #627): where it hurts, picked on the body map or
 * from the list (joints first), which side, when it started and today's
 * pain, plus an optional note. Opened from Profile → Injuries and from the
 * workout screen's injury button.
 */
export function ReportInjuryCard({
  userId,
  onClose,
  onReported,
}: {
  userId: string;
  onClose: () => void;
  onReported?: () => void;
}) {
  const today = useTodayKey();
  const [area, setArea] = useState("");
  const [side, setSide] = useState<InjurySide | null>(null);
  const [startedOn, setStartedOn] = useState(today);
  const [painLevel, setPainLevel] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A double tap on Save mustn't report the injury twice (#491).
  const busy = useRef(false);

  const paired = area !== "" && isPairedArea(area);
  const shading: MuscleShading = Object.fromEntries(
    (area ? areaMuscles(area) : []).map((muscle) => [muscle, 1]),
  );

  async function save(close: () => void) {
    if (busy.current) return;
    const input = {
      area,
      side,
      startedOn,
      painLevel: painLevel ?? -1,
      note,
      today,
    };
    // Every other field's error first, then the missing pain.
    const cleaned = cleanInjuryInput({ ...input, painLevel: painLevel ?? 0 });
    if (!cleaned.ok || painLevel === null) {
      setError(cleaned.ok ? "Pick today's pain" : cleaned.error);
      return;
    }
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      await reportInjury({ ...input, userId });
      onReported?.();
      close();
    } catch (caught) {
      busy.current = false;
      setSaving(false);
      setError(caught instanceof Error ? caught.message : "Couldn't save. Try again.");
    }
  }

  return (
    <FloatingCard labelledBy="report-injury-title" onClose={onClose}>
      {(requestClose) => (
        <>
          <h2 id="report-injury-title" className="touch-none px-4 pt-4 text-lg font-semibold">
            Report an injury
          </h2>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-3">
            <BodyMap
              shading={shading}
              label={area ? `${injuryAreaLabel(area, side)} picked` : "Tap where it hurts"}
              className="mx-auto w-full max-w-52"
              onPick={(muscle, tappedSide) => {
                setArea(muscle);
                if (isPairedArea(muscle) && tappedSide) setSide(tappedSide);
                setError(null);
              }}
            />
            <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
              Where does it hurt?
              <select
                aria-label="Injury area"
                value={area}
                onChange={(event) => {
                  setArea(event.target.value);
                  setError(null);
                }}
                className="min-h-11 min-w-0 rounded-lg border border-zinc-300 bg-white px-3 text-base font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="">Tap the map or pick one</option>
                <optgroup label="Joints">
                  {JOINTS.map((joint) => (
                    <option key={joint} value={joint}>
                      {capitalizeArea(joint)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Muscles">
                  {MUSCLES.map((muscle) => (
                    <option key={muscle} value={muscle}>
                      {capitalizeArea(muscle)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>

            {paired && (
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-sm font-semibold">Side</legend>
                <div className="grid grid-cols-3 gap-2">
                  {INJURY_SIDES.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={side === option}
                      onClick={() => setSide(option)}
                      className={`min-h-11 rounded-lg border px-2 text-sm font-medium ${
                        side === option
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-zinc-300 dark:border-zinc-700"
                      }`}
                    >
                      {SIDE_LABELS[option]}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
              Started
              <input
                type="date"
                value={startedOn}
                max={today}
                onChange={(event) => setStartedOn(event.target.value)}
                className="min-h-11 min-w-0 rounded-lg border border-zinc-300 bg-white px-3 text-base font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>

            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">Pain today</p>
              <PainPicker value={painLevel} onChange={setPainLevel} label="Pain today" />
            </div>

            <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
              <span>
                Note <span className="font-normal text-zinc-500">(optional)</span>
              </span>
              <textarea
                value={note}
                maxLength={INJURY_NOTE_MAX}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                className="min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base font-normal text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
          </div>

          <div className="flex touch-none flex-col gap-2 border-t border-zinc-200 px-4 pt-3 pb-4 dark:border-zinc-800">
            {error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-500">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={requestClose}
                className="min-h-11 flex-1 rounded-lg border border-zinc-300 px-4 text-base font-medium dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save(requestClose)}
                disabled={saving}
                className="min-h-11 flex-[2] rounded-lg bg-accent px-4 text-base font-medium text-accent-foreground disabled:opacity-50"
              >
                Report injury
              </button>
            </div>
          </div>
        </>
      )}
    </FloatingCard>
  );
}
