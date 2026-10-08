import { safeNextPath } from "@/lib/pwa/install-gate-exempt";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  // Where to land after the reset, e.g. /portal for a desktop sign-in (#444).
  const next = safeNextPath((await props.searchParams).next);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Jim</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Enter your email and we'll send you a link to reset your password.
        </p>
      </div>
      <ForgotPasswordForm next={next} />
    </main>
  );
}
