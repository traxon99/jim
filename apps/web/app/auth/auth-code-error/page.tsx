import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">Link expired</h1>
      <p className="max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
        That sign-in link is no longer valid. Request a new one below.
      </p>
      <Link href="/login" className="text-sm font-medium underline underline-offset-4">
        Back to sign in
      </Link>
    </main>
  );
}
