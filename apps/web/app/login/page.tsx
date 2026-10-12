import { safeNextPath } from "@/lib/pwa/install-gate-exempt";
import { LoginForm } from "./login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const next = safeNextPath(searchParams.next);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Jim</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Sign in to your account.</p>
      </div>
      <LoginForm next={next} />
    </main>
  );
}
