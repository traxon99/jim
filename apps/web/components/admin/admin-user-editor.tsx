"use client";

import {
  sendPasswordReset,
  setSignInDisabled,
  setUserRole,
  updateUserProfile,
  updateUserSettings,
} from "@/app/admin/(console)/users/actions";
import {
  ADMIN_SETTINGS_GROUPS,
  type SettingsField,
  fieldDisplayValue,
  fieldPatch,
} from "@/lib/admin/settings-fields";
import type { AdminActionResult } from "@/lib/admin/user-actions";
import type { AdminUserDetail } from "@/lib/admin/users-data";
import type { SettingsPayload } from "@/lib/settings/server-settings";
import { ACCOUNT_ROLE_LABELS, ASSIGNABLE_ROLES } from "@jim/core";
import { useState } from "react";

const CARD = "min-w-0 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800";
const ROW =
  "flex min-h-11 min-w-0 items-center justify-between gap-3 border-b border-zinc-200 py-1.5 text-sm last:border-b-0 dark:border-zinc-800";
const CONTROL =
  "min-w-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-950";
const BUTTON =
  "inline-flex h-9 items-center rounded-lg border border-zinc-200 px-3 text-sm font-medium disabled:opacity-50 dark:border-zinc-800";

/**
 * Tracks one save per field: which field is saving and the last error, so a
 * failure shows next to the control it came from and clears on the next try.
 */
function useFieldSaves() {
  const [saving, setSaving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function save(key: string, run: () => Promise<AdminActionResult>): Promise<boolean> {
    setSaving(key);
    setErrors(({ [key]: _, ...rest }) => rest);
    try {
      const result = await run();
      if (!result.ok) setErrors((current) => ({ ...current, [key]: result.error }));
      return result.ok;
    } catch {
      setErrors((current) => ({ ...current, [key]: "Couldn't save. Try again." }));
      return false;
    } finally {
      setSaving(null);
    }
  }
  return { saving, errors, save };
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="pb-1 text-xs text-red-600 dark:text-red-400">
      {message}
    </p>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-green-600" : "bg-zinc-300 dark:bg-zinc-700"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
          checked ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

/** Text or number that saves on blur, and only when it changed. */
function BlurInput({
  label,
  value,
  placeholder,
  inputMode,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  inputMode?: "decimal" | "numeric" | "text";
  disabled?: boolean;
  onCommit: (next: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(value);
  return (
    <input
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      inputMode={inputMode}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={async () => {
        if (draft === saved) return;
        if (await onCommit(draft)) setSaved(draft);
        else setDraft(saved);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className={`${CONTROL} w-40 text-right`}
    />
  );
}

export function AdminSettingsEditor({
  userId,
  settings,
}: {
  userId: string;
  settings: SettingsPayload;
}) {
  // Seeded once (docs/LESSONS.md, forms): a refresh landing mid-edit must not
  // replace what's being typed.
  const [values, setValues] = useState(settings);
  const { saving, errors, save } = useFieldSaves();

  async function commit(field: SettingsField, raw: string | boolean): Promise<boolean> {
    const patch = fieldPatch(field, raw);
    if (!patch) {
      await save(field.key, async () => ({ ok: false, error: "Invalid value" }));
      return false;
    }
    const ok = await save(field.key, () => updateUserSettings(userId, patch));
    if (ok) setValues((current) => ({ ...current, ...(patch as Partial<SettingsPayload>) }));
    return ok;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {ADMIN_SETTINGS_GROUPS.map((group) => (
        <section key={group.id} className={CARD} aria-label={group.label}>
          <h2 className="mb-1 text-sm font-semibold">{group.label}</h2>
          {group.fields.map((field) => {
            const shown = fieldDisplayValue(field, values);
            const busy = saving === field.key;
            return (
              <div key={field.key}>
                <div className={ROW}>
                  <span className="min-w-0 truncate">{field.label}</span>
                  {field.kind === "toggle" ? (
                    <Toggle
                      label={field.label}
                      checked={shown === true}
                      disabled={busy}
                      onChange={(next) => commit(field, next)}
                    />
                  ) : field.kind === "select" ? (
                    <select
                      aria-label={field.label}
                      value={String(shown)}
                      disabled={busy}
                      onChange={(event) => commit(field, event.target.value)}
                      className={`${CONTROL} w-40`}
                    >
                      {field.options.map((option) => (
                        <option key={String(option.value)} value={String(option.value)}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <BlurInput
                      label={field.label}
                      value={String(shown)}
                      placeholder={field.kind === "text" ? field.placeholder : undefined}
                      inputMode={
                        field.kind === "number" ? (field.integer ? "numeric" : "decimal") : "text"
                      }
                      disabled={busy}
                      onCommit={(next) => commit(field, next)}
                    />
                  )}
                </div>
                <FieldError message={errors[field.key]} />
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

export function AdminProfileEditor({ user, isSelf }: { user: AdminUserDetail; isSelf: boolean }) {
  const [role, setRole] = useState(user.role);
  const [sharing, setSharing] = useState({
    shareWorkouts: user.shareWorkouts,
    shareWorkoutDetails: user.shareWorkoutDetails,
    discoverableByFriendsOfFriends: user.discoverableByFriendsOfFriends,
  });
  const { saving, errors, save } = useFieldSaves();
  const roleLocked = isSelf || role === "admin";

  const text = (key: "username" | "displayName" | "bio", label: string, value: string | null) => (
    <div key={key}>
      <div className={ROW}>
        <span>{label}</span>
        <BlurInput
          label={label}
          value={value ?? ""}
          disabled={saving === key}
          onCommit={(next) => save(key, () => updateUserProfile(user.id, { [key]: next }))}
        />
      </div>
      <FieldError message={errors[key]} />
    </div>
  );

  return (
    <section className={CARD} aria-label="Account">
      <h2 className="mb-1 text-sm font-semibold">Account</h2>
      <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
        <div>
          <div className={ROW}>
            <span>Role</span>
            {roleLocked ? (
              <span className="text-zinc-500">{ACCOUNT_ROLE_LABELS[role]}</span>
            ) : (
              <select
                aria-label="Role"
                value={role}
                disabled={saving === "role"}
                onChange={async (event) => {
                  const next = event.target.value as typeof role;
                  if (await save("role", () => setUserRole(user.id, next))) setRole(next);
                }}
                className={`${CONTROL} w-40`}
              >
                {ASSIGNABLE_ROLES.map((option) => (
                  <option key={option} value={option}>
                    {ACCOUNT_ROLE_LABELS[option]}
                  </option>
                ))}
              </select>
            )}
          </div>
          <FieldError message={errors.role} />
          {text("username", "Username", user.username)}
          {text("displayName", "Display name", user.displayName)}
          {text("bio", "Bio", user.bio)}
        </div>
        <div>
          {(
            [
              ["shareWorkouts", "Share workouts"],
              ["shareWorkoutDetails", "Share workout details"],
              ["discoverableByFriendsOfFriends", "Suggested to friends of friends"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <div className={ROW}>
                <span className="min-w-0 truncate">{label}</span>
                <Toggle
                  label={label}
                  checked={sharing[key]}
                  disabled={saving === key}
                  onChange={async (next) => {
                    if (await save(key, () => updateUserProfile(user.id, { [key]: next }))) {
                      setSharing((current) => ({ ...current, [key]: next }));
                    }
                  }}
                />
              </div>
              <FieldError message={errors[key]} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AdminUserActions({
  userId,
  disabled,
  isSelf,
}: {
  userId: string;
  disabled: boolean;
  isSelf: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function run(
    key: string,
    confirmText: string,
    action: () => Promise<AdminActionResult>,
    doneText: string,
  ) {
    if (busy || !window.confirm(confirmText)) return;
    setBusy(key);
    setMessage(null);
    try {
      const result = await action();
      setMessage(
        result.ok ? { text: doneText, error: false } : { text: result.error, error: true },
      );
    } catch {
      setMessage({ text: "Something went wrong. Try again.", error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            run(
              "reset",
              "Email this account a password reset link?",
              () => sendPasswordReset(userId),
              "Reset email sent",
            )
          }
          className={BUTTON}
        >
          Password reset
        </button>
        {!isSelf && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              run(
                "signin",
                disabled
                  ? "Let this account sign in again?"
                  : "Disable sign-in? They're signed out everywhere within the hour; their data stays.",
                () => setSignInDisabled(userId, !disabled),
                disabled ? "Sign-in enabled" : "Sign-in disabled",
              )
            }
            className={`${BUTTON} ${disabled ? "" : "text-red-600 dark:text-red-400"}`}
          >
            {disabled ? "Enable sign-in" : "Disable sign-in"}
          </button>
        )}
      </div>
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`text-sm ${message.error ? "text-red-600 dark:text-red-400" : "text-zinc-500"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
