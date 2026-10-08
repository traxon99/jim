import { safeNextPath } from "@/lib/pwa/install-gate-exempt";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage(props: PageProps<"/reset-password">) {
  const next = safeNextPath((await props.searchParams).next);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Jim</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Choose a new password.</p>
      </div>
      <ResetPasswordForm next={next} />
    </main>
  );
}
