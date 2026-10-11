"use client";

import type { PortalGym } from "@/lib/portal/analysis-data";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { useEffect, useRef, useState } from "react";

type Leaflet = typeof import("leaflet");

// OpenStreetMap's own tiles: free with attribution for light use like this
// one person's map, and no API key to leak or expire.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function workoutsLabel(count: number): string {
  return `${count.toLocaleString()} workout${count === 1 ? "" : "s"}`;
}

/** Tooltip content built from text nodes, so a gym's name can't inject markup. */
function tooltipContent(gym: PortalGym, count: number): HTMLElement {
  const root = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = gym.isHome ? `${gym.name} (home)` : gym.name;
  const detail = document.createElement("div");
  detail.textContent = workoutsLabel(count);
  root.append(name, detail);
  return root;
}

/**
 * The Analysis map (issue #462): every gym matched to a real place, as an
 * accent dot sized by how many workouts were logged there in the chosen
 * range. Leaflet is loaded on demand so it never weighs on the phone app.
 * In dark mode globals.css inverts the tiles; the container clips with
 * `clip-path` as well as its rounded corners, since iOS Safari doesn't clip
 * a filtered layer to `border-radius` (#374). Wheel zoom stays off so the
 * page still scrolls past the map.
 */
export function GymMap({
  gyms,
  visits,
}: {
  gyms: readonly PortalGym[];
  visits: ReadonlyMap<string, number>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<Leaflet | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void import("leaflet").then((L) => {
      const container = containerRef.current;
      if (cancelled || !container) return;
      const map = L.map(container, { scrollWheelZoom: false, worldCopyJump: true });
      map.setView([20, 0], 2);
      L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);

      leafletRef.current = L;
      mapRef.current = map;
      markersRef.current = L.layerGroup().addTo(map);
      setReady(true);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const markers = markersRef.current;
    if (!ready || !L || !map || !markers) return;

    markers.clearLayers();
    const most = Math.max(1, ...gyms.map((gym) => visits.get(gym.id) ?? 0));
    for (const gym of gyms) {
      const count = visits.get(gym.id) ?? 0;
      L.circleMarker([gym.latitude, gym.longitude], {
        radius: 7 + 11 * Math.sqrt(count / most),
        className: "gym-map-marker",
        weight: gym.isHome ? 3 : 2,
        fillOpacity: count > 0 ? 0.85 : 0.35,
      })
        .bindTooltip(tooltipContent(gym, count), { direction: "top", offset: [0, -6] })
        .addTo(markers);
    }

    const [only] = gyms;
    if (gyms.length === 1 && only) {
      map.setView([only.latitude, only.longitude], 14);
    } else if (gyms.length > 1) {
      map.fitBounds(
        L.latLngBounds(gyms.map((gym) => [gym.latitude, gym.longitude] as [number, number])),
        { padding: [32, 32], maxZoom: 15 },
      );
    }
  }, [ready, gyms, visits]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={`Map of ${gyms.length} gym${gyms.length === 1 ? "" : "s"}`}
      className="gym-map relative isolate z-0 h-72 w-full overflow-hidden rounded-lg [clip-path:inset(0_round_0.5rem)] border border-zinc-200 bg-zinc-100 md:h-96 dark:border-zinc-800 dark:bg-zinc-900"
    />
  );
}
