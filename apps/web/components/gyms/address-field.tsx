"use client";

import { GYM_ADDRESS_MAX } from "@/lib/gyms";
import { PLACE_QUERY_MIN, type Place, cleanPlaceQuery, placeLabel } from "@jim/core";
import { Check, MapPin } from "lucide-react";
import { useEffect, useId, useState } from "react";

/** How long typing has to pause before the address is looked up. */
const LOOKUP_DELAY_MS = 400;

export interface AddressValue {
  address: string;
  latitude: number | null;
  longitude: number | null;
}

type Lookup =
  | { state: "idle" }
  | { state: "searching" }
  | { state: "done"; places: Place[] }
  | { state: "failed" };

/**
 * A gym's address, matched to a real place (issue #462). Typing looks the
 * address up and lists matches right under the field (in the page's flow,
 * not a popup, so nothing can paint over it); picking one fills the address
 * and pins the gym on the Analysis map. Typing again unpins it, so a pin
 * always matches the address shown. A typed-only address still saves, for
 * when the lookup has no match or the phone is offline.
 */
export function AddressField({
  value,
  inputClass,
  onChange,
}: {
  value: AddressValue;
  inputClass: string;
  onChange: (value: AddressValue) => void;
}) {
  // Only what the user types is looked up, never a place they just picked.
  const [query, setQuery] = useState<string | null>(null);
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const listId = useId();
  const pinned = value.latitude !== null && value.longitude !== null;

  useEffect(() => {
    const cleaned = query === null ? null : cleanPlaceQuery(query);
    if (!cleaned) {
      setLookup({ state: "idle" });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLookup({ state: "searching" });
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(cleaned)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { places?: Place[] };
        setLookup({ state: "done", places: body.places ?? [] });
      } catch {
        if (!controller.signal.aborted) setLookup({ state: "failed" });
      }
    }, LOOKUP_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function pick(place: Place) {
    onChange({
      address: placeLabel(place).slice(0, GYM_ADDRESS_MAX),
      latitude: place.latitude,
      longitude: place.longitude,
    });
    setQuery(null);
  }

  const places = lookup.state === "done" ? lookup.places : [];
  const typed = value.address.trim().length >= PLACE_QUERY_MIN;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
        Address (optional)
        <input
          type="text"
          value={value.address}
          maxLength={GYM_ADDRESS_MAX}
          autoComplete="off"
          placeholder="Search for your gym or its address"
          aria-controls={places.length > 0 ? listId : undefined}
          onChange={(event) => {
            onChange({ address: event.target.value, latitude: null, longitude: null });
            setQuery(event.target.value);
          }}
          className={`${inputClass} min-w-0`}
        />
      </label>
      {places.length > 0 && (
        <ul
          id={listId}
          aria-label="Matching places"
          className="flex min-w-0 flex-col divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-300 dark:divide-zinc-800 dark:border-zinc-700"
        >
          {places.map((place) => (
            <li key={`${place.latitude},${place.longitude},${place.address}`}>
              <button
                type="button"
                onClick={() => pick(place)}
                className="flex min-h-11 w-full min-w-0 items-start gap-2 px-3 py-2 text-left"
              >
                <MapPin
                  className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className="flex min-w-0 flex-col">
                  {place.name && <span className="truncate text-sm font-medium">{place.name}</span>}
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{place.address}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pinned ? (
        <p className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          <Check className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2} aria-hidden="true" />
          Matched to a real place. It shows on your Analysis map.
        </p>
      ) : lookup.state === "searching" ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">Looking it up…</p>
      ) : lookup.state === "failed" ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Couldn&apos;t look that up right now. You can still save it as typed.
        </p>
      ) : lookup.state === "done" && places.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          No matching place. Try the gym&apos;s name or street, or save it as typed.
        </p>
      ) : places.length > 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Pick a match to put it on your map.
        </p>
      ) : typed ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">Not on your map yet.</p>
      ) : null}
    </div>
  );
}
