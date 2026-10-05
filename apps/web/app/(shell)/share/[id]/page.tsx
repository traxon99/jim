import { SharedPreview } from "@/components/sharing/shared-preview";
import { loadSharePreview, sharePreviewDescription } from "@/lib/sharing/preview";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { headers } from "next/headers";

/**
 * The link preview chat apps show when a share link is pasted (issue #431).
 * Its image is ./opengraph-image.tsx, which Next adds to these tags itself.
 */
export async function generateMetadata(props: PageProps<"/share/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const preview = await loadSharePreview(id);
  if (!preview) return { title: "Jim", description: "This link doesn't work anymore." };

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const title = preview.summary.name;
  const description = sharePreviewDescription(preview);
  return {
    // Absolute og:image and og:url on whichever domain the link was shared from.
    metadataBase: host ? new URL(`${protocol}://${host}`) : undefined,
    title,
    description,
    // Previews are for the chats a link is pasted into, not search results.
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: "Jim",
      title,
      description,
      url: `/share/${id}`,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharePage(props: PageProps<"/share/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  // Signed out, this is a chat app fetching the link preview (proxy.ts): the
  // tags above are all it gets.
  if (!userId) return null;

  return <SharedPreview id={id} userId={userId} />;
}
