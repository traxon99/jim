import { createClient } from "@/lib/supabase/server";
import { cleanPlaceQuery, searchPlaces } from "@jim/core";
import { NextResponse } from "next/server";

/**
 * Looks up real places for a gym's address (issue #462): `?q=` → `{ places }`.
 * Proxied here rather than called from the phone so the lookup service sees
 * this server's User-Agent, not every user's, and so it's signed-in only:
 * it isn't an open geocoding proxy for the world.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const query = cleanPlaceQuery(new URL(request.url).searchParams.get("q") ?? "");
  if (!query) return NextResponse.json({ places: [] });

  try {
    const places = await searchPlaces(query, fetch, "Jim workout tracker (gym address lookup)");
    return NextResponse.json({ places });
  } catch {
    return NextResponse.json({ error: "Couldn't look that address up" }, { status: 502 });
  }
}
