import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        {data?.claims.email && (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{data.claims.email}</p>
        )}
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Units, bar weight, plates and rest timer defaults land with logging in S6.
      </p>
      <SignOutButton />
    </main>
  );
}
