import { PortalNav } from "@/components/portal/portal-nav";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
// The Analysis gym map's (issue #462) Leaflet styles; the library itself
// loads on demand inside components/portal/gym-map.tsx.
import "leaflet/dist/leaflet.css";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Training analysis · Jim",
};

/**
 * The web portal (issue #38). Outside the (shell) group on purpose: no tab
 * bar, no sync engine, no IndexedDB — it reads straight from Postgres, so
 * it works in a desktop browser the install gate would otherwise block
 * (see components/install-gate.tsx and ADR-015). Each section is its own
 * route below this layout and loads only its own data (issue #470); the
 * pages redirect to sign-in themselves, so this only reads who's signed in.
 */
export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims.email === "string" ? data.claims.email : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {/* The nav reads ?range= (useSearchParams), which needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <PortalNav email={email} />
      </Suspense>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div
          className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-6 md:px-8"
          // The installed app's home indicator sits over the last row (#527).
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
