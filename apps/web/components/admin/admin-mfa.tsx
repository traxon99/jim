"use client";

import { qrCodeSrc } from "@/lib/admin/qr-code";
import { authErrorMessage } from "@/lib/auth/error-message";
import { ADMIN_PATH } from "@/lib/pwa/install-gate-exempt";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Step =
  | { kind: "loading" }
  | { kind: "enroll"; factorId: string; qrCode: string; secret: string }
  | { kind: "verify"; factorId: string }
  | { kind: "failed"; message: string };

const FRIENDLY_NAME = "Jim admin";

/**
 * TOTP for /admin (issue #806). An admin with a verified authenticator enters
 * its code; one without enrols first by scanning the QR code. Either way a
 * correct code lifts the session to aal2, which /admin requires.
 */
export function AdminMfa() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice; a second enrol would leave a stray factor.
    if (started.current) return;
    started.current = true;
    const supabase = createClient();
    (async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const verified = data.totp.find((factor) => factor.status === "verified");
      if (verified) {
        setStep({ kind: "verify", factorId: verified.id });
        return;
      }
      // A half-finished enrolment (page closed before the code) blocks a new
      // one with the same name, so clear it first.
      for (const factor of data.all) {
        if (factor.factor_type === "totp" && factor.status !== "verified") {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      }
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: FRIENDLY_NAME,
        issuer: "Jim",
      });
      if (enrollError) throw enrollError;
      setStep({
        kind: "enroll",
        factorId: enrolled.id,
        qrCode: qrCodeSrc(enrolled.totp.qr_code),
        secret: enrolled.totp.secret,
      });
    })().catch((cause: unknown) => {
      setStep({ kind: "failed", message: authErrorMessage(cause as Error) });
    });
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || (step.kind !== "enroll" && step.kind !== "verify")) return;
    setSubmitting(true);
    setError("");
    try {
      const { error: verifyError } = await createClient().auth.mfa.challengeAndVerify({
        factorId: step.factorId,
        code: code.trim(),
      });
      if (verifyError) {
        setError(authErrorMessage(verifyError));
        setSubmitting(false);
        return;
      }
      router.replace(ADMIN_PATH);
      router.refresh();
    } catch (cause) {
      setError(authErrorMessage(cause as Error));
      setSubmitting(false);
    }
  }

  if (step.kind === "loading") {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }
  if (step.kind === "failed") {
    return (
      <div className="flex flex-col items-center gap-3">
        <p role="alert" className="allow-pwa-select text-sm text-red-600 dark:text-red-400">
          {step.message}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col items-center gap-3">
      {step.kind === "enroll" && (
        <>
          <img
            src={step.qrCode}
            alt="Authenticator QR code"
            width={192}
            height={192}
            className="rounded-lg bg-white p-2"
          />
          <code className="allow-pwa-select max-w-full break-all text-xs text-zinc-500">
            {step.secret}
          </code>
        </>
      )}
      <label htmlFor="admin-totp" className="sr-only">
        Authenticator code
      </label>
      <input
        id="admin-totp"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        // biome-ignore lint/a11y/noAutofocus: the code is the only thing on the page
        autoFocus
        placeholder="123456"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
        className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-center text-base tracking-[0.3em] text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
      <button
        type="submit"
        disabled={submitting || code.length !== 6}
        className="w-full rounded-lg bg-accent px-4 py-3 text-base font-medium text-accent-foreground disabled:opacity-50"
      >
        {step.kind === "enroll" ? "Turn on" : "Continue"}
      </button>
      {error && (
        <p role="alert" className="allow-pwa-select text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
