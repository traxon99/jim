"use client";

import { MUSCLES, isWithinTarget, muscleTargetChildren, muscleTreeNode } from "@jim/core";

const CHIP = "min-h-11 rounded-full border px-3 py-1.5 text-sm";
const ON = "border-accent bg-accent text-accent-foreground";
/** A muscle whose heads are picked, rather than the muscle itself. */
const PARTLY = "border-accent text-zinc-950 dark:text-zinc-50";
const OFF = "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300";

function Chip({
  label,
  state,
  onClick,
}: {
  label: string;
  state: "on" | "partly" | "off";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={state === "on" ? true : state === "partly" ? "mixed" : false}
      className={`${CHIP} ${state === "on" ? ON : state === "partly" ? PARTLY : OFF}`}
    >
      {label}
    </button>
  );
}

/**
 * The exercise editor's muscle picker with Muscle detail on (issue #879): the
 * groups as before, and under each group in use its muscles, then a picked
 * muscle's heads. Picking a muscle replaces the group's own tag; see
 * `pickTarget` for the rules.
 */
export function MuscleTreePicker({
  legend,
  hint,
  picked,
  onPick,
}: {
  legend: string;
  hint: string;
  picked: readonly string[];
  onPick: (id: string) => void;
}) {
  const within = (id: string) => picked.some((node) => isWithinTarget(node, id));
  // Abductors are retired into glutes (#874); offered only while still tagged.
  const groups = MUSCLES.filter((group) => group !== "abductors" || within(group));
  const open = groups.filter((group) => within(group) && muscleTargetChildren(group).length > 0);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <span className="text-xs font-normal text-zinc-500 dark:text-zinc-500">{hint}</span>
      <div className="flex flex-wrap gap-2">
        {groups.map((group) => (
          <Chip
            key={group}
            label={group}
            state={within(group) ? "on" : "off"}
            onClick={() => onPick(group)}
          />
        ))}
      </div>
      {open.map((group) => (
        <div key={group} className="page-fade flex flex-col gap-2 pt-1">
          <span className="text-xs font-medium text-zinc-500 capitalize dark:text-zinc-500">
            {muscleTreeNode(group)?.label}
          </span>
          <div className="flex flex-wrap gap-2">
            {muscleTargetChildren(group).flatMap((muscle) => {
              const heads = muscleTargetChildren(muscle.id);
              const chip = (
                <Chip
                  key={muscle.id}
                  label={muscle.label}
                  state={picked.includes(muscle.id) ? "on" : within(muscle.id) ? "partly" : "off"}
                  onClick={() => onPick(muscle.id)}
                />
              );
              if (heads.length === 0 || !within(muscle.id)) return [chip];
              return [
                chip,
                ...heads.map((head) => (
                  <Chip
                    key={head.id}
                    label={head.label}
                    state={picked.includes(head.id) ? "on" : "off"}
                    onClick={() => onPick(head.id)}
                  />
                )),
              ];
            })}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
