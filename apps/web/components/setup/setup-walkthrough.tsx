"use client";

import { CallMark } from "@/components/dpr/call-mark";
import { EXPERIENCE_LABELS } from "@/components/dpr/labels";
import { AddressField, type AddressValue } from "@/components/gyms/address-field";
import { PAGE_BODY, PageHeader } from "@/components/page-header";
import { AccentColorSection } from "@/components/profile/accent-color-section";
import { CardStyleSection } from "@/components/profile/card-style-section";
import { ColorSchemeSection } from "@/components/profile/color-scheme-section";
import { type GymRow, db } from "@/lib/db/schema";
import { addExploreProgram, startExploreProgramDpr } from "@/lib/explore/add-template";
import { GYM_NAME_MAX, cleanGymInput, setDefaultGym, sortGyms } from "@/lib/gyms";
import { setActiveProgram } from "@/lib/programs/set-active";
import { DEFAULT_SETTINGS, patchSettings } from "@/lib/settings";
import { saveSetupGym } from "@/lib/setup/save-gym";
import { SETUP_STEPS, type SetupStep, setupExitHref } from "@/lib/setup/steps";
import { runSyncCycle } from "@/lib/sync/engine";
import { type ExploreProgramTemplate, PROGRAM_TEMPLATES } from "@jim/core";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

const inputClass =
  "w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

const GOAL_LABELS: Record<ExploreProgramTemplate["info"]["goal"], string> = {
  strength: "Strength",
  hypertrophy: "Muscle",
  general: "General fitness",
};

const EMPTY_ADDRESS: AddressValue = { address: "", latitude: null, longitude: null };

/** A full-width choice card, pressed when picked. */
function ChoiceButton({
  pressed,
  onClick,
  title,
  detail,
  icon,
}: {
  pressed: boolean;
  onClick: () => void;
  title: string;
  detail?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg border px-3 py-3 text-left ${
        pressed ? "border-accent ring-1 ring-accent" : "border-zinc-300 dark:border-zinc-700"
      }`}
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-medium">{title}</span>
        {detail && <span className="text-xs text-zinc-500 dark:text-zinc-500">{detail}</span>}
      </span>
      {pressed && (
        <Check className="h-5 w-5 shrink-0 text-accent" strokeWidth={2.25} aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * The setup walkthrough (issue #464): home gym, a first program, Simple or
 * Advanced, PRP, then theme and accent color. Every choice saves as it's
 * made (the same way Settings does), so leaving partway keeps what was set.
 * New accounts land here once on launch (SetupGate); Settings opens it any
 * time. Finishing or skipping marks setup done, so it won't open on its own
 * again.
 */
export function SetupWalkthrough({ userId, from }: { userId: string; from: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<SetupStep>("welcome");
  const [busy, setBusy] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  // The gym once saved, so "Try again" doesn't add it a second time.
  const createdGym = useRef<GymRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settings = useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
  const gymRows = useLiveQuery(() => db.gyms.toArray(), []);
  const gyms = useMemo(() => sortGyms(gymRows ?? []), [gymRows]);
  const programs = useLiveQuery(() => db.programs.toArray(), []);
  const livePrograms = useMemo(() => (programs ?? []).filter((p) => !p.deletedAt), [programs]);
  const activeProgram = livePrograms.find((p) => p.isActive) ?? null;

  const [gymName, setGymName] = useState("");
  const [gymAddress, setGymAddress] = useState<AddressValue>(EMPTY_ADDRESS);
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  // The program this walkthrough added or switched to, so the PRP step can
  // start PRP on its main lifts.
  const [chosen, setChosen] = useState<{
    programId: string;
    template: ExploreProgramTemplate;
  } | null>(null);
  const [prpChoice, setPrpChoice] = useState<boolean | null>(null);

  const index = SETUP_STEPS.indexOf(step);
  const counted = SETUP_STEPS.length - 1;

  function go(next: SetupStep) {
    setError(null);
    setStep(next);
    // Back to the top of the shell's scroller for the new step.
    mainRef.current?.scrollIntoView({ block: "start" });
  }
  function goNext() {
    const next = SETUP_STEPS[index + 1];
    if (next) go(next);
  }
  function goBack() {
    const previous = SETUP_STEPS[index - 1];
    if (previous) go(previous);
  }

  async function finish() {
    setBusy(true);
    // Offline, it just opens again next launch; nothing else is lost.
    await patchSettings({ onboardedAt: new Date() });
    setBusy(false);
    router.replace(setupExitHref(from));
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch {
      setError("Couldn't save that. Try again, or skip this step.");
    } finally {
      setBusy(false);
    }
  }

  async function saveGymAndContinue() {
    if (gymName.trim() === "") {
      goNext();
      return;
    }
    const input = { ...gymAddress, name: gymName, notes: "" };
    const cleaned = cleanGymInput(input);
    if (!cleaned.ok) {
      setError(cleaned.error);
      return;
    }
    await run(async () => {
      await saveSetupGym({ userId, ...input }, createdGym);
      setGymName("");
      setGymAddress(EMPTY_ADDRESS);
      void runSyncCycle();
      goNext();
    });
  }

  async function saveProgramAndContinue() {
    const template = PROGRAM_TEMPLATES.find((t) => t.key === templateKey);
    if (!template) {
      goNext();
      return;
    }
    await run(async () => {
      const existing = livePrograms.find((p) => p.name === template.name);
      let programId: string;
      if (existing) {
        programId = existing.id;
        if (!existing.isActive) await setActiveProgram(existing.id);
      } else {
        const added = await addExploreProgram(userId, template, {
          activate: true,
          startDpr: false,
        });
        programId = added.programId;
      }
      setChosen({ programId, template });
      void runSyncCycle();
      goNext();
    });
  }

  async function saveAdvanced(value: boolean) {
    if (value === settings.advancedFeatures) return;
    setError(null);
    const result = await patchSettings({ advancedFeatures: value });
    if (!result.ok) setError(result.error);
  }

  async function savePrpAndContinue() {
    const enable = prpChoice ?? settings.dprEnabled;
    await run(async () => {
      // A block already running just keeps going; PRP is on either way.
      if (enable && chosen) {
        await startExploreProgramDpr(userId, chosen.programId, chosen.template);
        void runSyncCycle();
      }
      if (enable !== settings.dprEnabled) {
        const result = await patchSettings({ dprEnabled: enable });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      goNext();
    });
  }

  const backButton = (
    <button
      type="button"
      onClick={goBack}
      disabled={busy}
      className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-zinc-300 px-3 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
    >
      Back
    </button>
  );
  function nextButton(label: string, onClick: () => void) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground disabled:opacity-50"
      >
        {label}
      </button>
    );
  }
  const skipStepButton = (
    <button
      type="button"
      onClick={goNext}
      disabled={busy}
      className="min-h-11 self-center text-sm font-medium text-zinc-500 underline underline-offset-4 disabled:opacity-50 dark:text-zinc-400"
    >
      Skip this step
    </button>
  );

  return (
    <main ref={mainRef} className="flex flex-1 flex-col">
      <PageHeader
        title="Set up Jim"
        back={from === "settings" ? { href: "/profile/settings", label: "Settings" } : undefined}
        actions={
          step === "welcome" ? undefined : (
            <button
              type="button"
              onClick={() => void finish()}
              disabled={busy}
              className="min-h-11 px-2 text-sm font-medium text-zinc-500 disabled:opacity-50 dark:text-zinc-400"
            >
              Skip setup
            </button>
          )
        }
      />
      <div key={step} className={`route-fade ${PAGE_BODY}`}>
        {step !== "welcome" && (
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Step {index} of {counted}
          </p>
        )}

        {step === "welcome" && (
          <>
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-semibold">Welcome to Jim</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                A few quick questions to fit the app to how you train: where you lift, what program
                you run, how much detail you want, and how it looks. Every step can be skipped, and
                you can run this again any time from Settings.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {nextButton("Get started", goNext)}
              <button
                type="button"
                onClick={() => void finish()}
                disabled={busy}
                className="min-h-11 text-sm font-medium text-zinc-500 underline underline-offset-4 disabled:opacity-50 dark:text-zinc-400"
              >
                Skip setup
              </button>
            </div>
          </>
        )}

        {step === "gym" && (
          <>
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-semibold">Your home gym</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Where you usually train. Workouts start there by default, and you can add more gyms
                later in Settings.
              </p>
            </div>
            {gyms.length > 0 && (
              <ul className="flex flex-col gap-2">
                {gyms.map((gym) => (
                  <li key={gym.id}>
                    <ChoiceButton
                      pressed={gym.isDefault}
                      onClick={() => {
                        if (!gym.isDefault) {
                          void setDefaultGym(gym.id).then(() => runSyncCycle());
                        }
                      }}
                      title={gym.name}
                      detail={gym.isDefault ? "Home gym" : (gym.address ?? undefined)}
                      icon={
                        <Star
                          className={`h-5 w-5 shrink-0 ${gym.isDefault ? "text-accent" : "text-zinc-400 dark:text-zinc-600"}`}
                          strokeWidth={1.75}
                          fill={gym.isDefault ? "currentColor" : "none"}
                          aria-hidden="true"
                        />
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
            <div className="flex min-w-0 flex-col gap-3">
              {gyms.length > 0 && (
                <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                  Add another
                </h3>
              )}
              <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
                Gym name
                <input
                  type="text"
                  value={gymName}
                  maxLength={GYM_NAME_MAX}
                  placeholder="e.g. Iron Temple"
                  onChange={(event) => setGymName(event.target.value)}
                  className={inputClass}
                />
              </label>
              <AddressField value={gymAddress} inputClass={inputClass} onChange={setGymAddress} />
            </div>
            <div className="flex gap-2">
              {backButton}
              {nextButton(gymName.trim() ? "Save and continue" : "Next", () => {
                void saveGymAndContinue();
              })}
            </div>
            {skipStepButton}
          </>
        )}

        {step === "program" && (
          <>
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-semibold">Your first program</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {activeProgram
                  ? `You're running ${activeProgram.name}. Pick one below to switch, or keep it.`
                  : "Pick a proven program to start with. It becomes your active program, and the Workout tab shows what's next. You can build your own later in Routines."}
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {PROGRAM_TEMPLATES.map((template) => (
                <li key={template.key}>
                  <ChoiceButton
                    pressed={templateKey === template.key}
                    onClick={() =>
                      setTemplateKey((current) => (current === template.key ? null : template.key))
                    }
                    title={template.name}
                    detail={`${EXPERIENCE_LABELS[template.info.level]} · ${template.info.daysPerWeek} days a week · ${GOAL_LABELS[template.info.goal]}`}
                  />
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              {backButton}
              {nextButton(templateKey ? "Add and continue" : "Next", () => {
                void saveProgramAndContinue();
              })}
            </div>
            {skipStepButton}
          </>
        )}

        {step === "features" && (
          <>
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-semibold">How much detail?</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                You can change this, or pick features one by one, any time in Settings → Advanced.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <ChoiceButton
                pressed={settings.advancedFeatures === false}
                onClick={() => void saveAdvanced(false)}
                title="Simple"
                detail="Log weight and reps. Best if you're new to lifting."
              />
              <ChoiceButton
                pressed={settings.advancedFeatures !== false}
                onClick={() => void saveAdvanced(true)}
                title="Advanced"
                detail="Also log RPE (how hard each set felt), set types and rest stats, and track your pace during a workout."
              />
            </div>
            <div className="flex gap-2">
              {backButton}
              {nextButton("Next", goNext)}
            </div>
          </>
        )}

        {step === "prp" && (
          <>
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-semibold">PR Progression (PRP)</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                PRP reads your reps and RPE and tells you, lift by lift, whether to go{" "}
                <CallMark call="increase" />, <CallMark call="hold" /> or <CallMark call="deload" />{" "}
                next time.
                {settings.advancedFeatures === false &&
                  " Turning it on brings back the RPE column, since PRP needs it."}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <ChoiceButton
                pressed={prpChoice ?? settings.dprEnabled}
                onClick={() => setPrpChoice(true)}
                title="Use PRP"
                detail={
                  chosen?.template.info.dpr
                    ? `Starts on ${chosen.template.name}'s main lifts.`
                    : "Pick the lifts to progress on the Progression page."
                }
              />
              <ChoiceButton
                pressed={!(prpChoice ?? settings.dprEnabled)}
                onClick={() => setPrpChoice(false)}
                title="Not now"
                detail="Turn it on later in Settings."
              />
            </div>
            <div className="flex gap-2">
              {backButton}
              {nextButton("Next", () => {
                void savePrpAndContinue();
              })}
            </div>
          </>
        )}

        {step === "look" && (
          <>
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-semibold">Make it yours</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Pick a theme and an accent color. Changes show right away.
              </p>
            </div>
            <ColorSchemeSection />
            <AccentColorSection />
            <CardStyleSection />
            <div className="flex gap-2">
              {backButton}
              {nextButton("Finish", () => {
                void finish();
              })}
            </div>
          </>
        )}

        {error && (
          <p className="allow-pwa-select text-sm text-red-600 dark:text-red-500">{error}</p>
        )}
      </div>
    </main>
  );
}
