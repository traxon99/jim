import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Jim</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Enter your email and we'll send you a link to reset your password.
        </p>
      </div>
      <ForgotPasswordForm />
    </main>
  );
}
