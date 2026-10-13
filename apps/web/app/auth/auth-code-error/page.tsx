import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">Link expired</h1>
      <p className="max-w-xs text-sm text-zinc-600 dark:text-zinc-400">
        That link is no longer valid. Sign in, or request a new password reset link.
      </p>
      <Link
        href="/login"
        className="flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
      >
        Back to sign in
      </Link>
      <Link
        href="/forgot-password"
        className="flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
      >
        Reset password
      </Link>
    </main>
  );
}
