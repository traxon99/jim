import { safeNextPath } from "@/lib/pwa/install-gate-exempt";
import { ContinueInApp } from "./continue-in-app";

// Where a sign-up confirmation link lands (#670). iOS opens it in Safari,
// never in the home-screen app, and the two don't share a session, so Safari
// being signed in doesn't help: the person has to go back to the installed
// app and sign in there. Install-gate exempt, so Safari can show it.
export default async function EmailConfirmedPage({ searchParams }: PageProps<"/auth/confirmed">) {
  const next = safeNextPath((await searchParams).next);
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">Email confirmed</h1>
      <p className="max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
        Open Jim from your home screen and sign in with your email and password.
      </p>
      <p className="max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
        Haven't added Jim to your home screen yet? Sign in there after you do.
      </p>
      <ContinueInApp next={next} />
    </main>
  );
}
