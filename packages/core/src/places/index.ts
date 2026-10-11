/**
 * Place lookup for gym addresses (issue #462): turns what the user types
 * into real places with coordinates, so a gym can be pinned on the
 * Analysis map. Backed by Photon (photon.komoot.io), an OpenStreetMap
 * geocoder that allows search-as-you-type and needs no API key. The web
 * app calls it from `/api/places`, the MCP server from `search_places`.
 */

export const PLACE_QUERY_MIN = 3;
export const PLACE_QUERY_MAX = 200;
export const PLACE_RESULTS_MAX = 5;

const PHOTON_URL = "https://photon.komoot.io/api/";

/** A real place a gym's address can resolve to. */
export interface Place {
  /** The place's own name when it has one (e.g. "Gold's Gym"), else null. */
  name: string | null;
  /** A one-line postal address, without the name. */
  address: string;
  latitude: number;
  longitude: number;
}

export function isValidCoordinate(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

/**
 * A gym's coordinates as a pair, or null unless both are valid. Rows
 * cached before #462 don't carry the fields at all.
 */
export function gymCoordinates(gym: {
  latitude?: number | null;
  longitude?: number | null;
}): { latitude: number; longitude: number } | null {
  return isValidCoordinate(gym.latitude, gym.longitude)
    ? { latitude: gym.latitude as number, longitude: gym.longitude as number }
    : null;
}

/** The trimmed query, or null when it's too short to be worth a lookup. */
export function cleanPlaceQuery(query: string): string | null {
  const trimmed = query.trim().slice(0, PLACE_QUERY_MAX);
  return trimmed.length >= PLACE_QUERY_MIN ? trimmed : null;
}

export function placeSearchUrl(query: string, limit = PLACE_RESULTS_MAX): string {
  const params = new URLSearchParams({ q: query, limit: String(limit), lang: "en" });
  return `${PHOTON_URL}?${params.toString()}`;
}

interface PhotonProperties {
  name?: string;
  housenumber?: string;
  street?: string;
  district?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

interface PhotonFeature {
  properties?: PhotonProperties;
  geometry?: { type?: string; coordinates?: unknown };
}

function joinParts(parts: (string | undefined)[], separator: string): string {
  return parts.filter((part) => part && part.trim() !== "").join(separator);
}

/**
 * Photon's GeoJSON → places, one line of address each, dropping anything
 * without usable coordinates and duplicates of the same spot.
 */
export function parsePlaceResults(body: unknown): Place[] {
  const features = (body as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const places: Place[] = [];
  const seen = new Set<string>();
  for (const feature of features as PhotonFeature[]) {
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates)) continue;
    const [longitude, latitude] = coordinates;
    if (!isValidCoordinate(latitude, longitude)) continue;
    const props = feature.properties ?? {};
    const street = joinParts([props.housenumber, props.street], " ");
    const region = joinParts([props.state, props.postcode], " ");
    const address = joinParts([street, props.city ?? props.district, region, props.country], ", ");
    const name = props.name?.trim() || null;
    const line = address || name;
    if (!line) continue;
    const key = `${name ?? ""}|${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    places.push({
      name: name && name !== street && name !== line ? name : null,
      address: line,
      latitude: latitude as number,
      longitude: longitude as number,
    });
  }
  return places;
}

/** How a place reads in a gym's address field: "Name, address" when it has a name. */
export function placeLabel(place: Place): string {
  return place.name ? `${place.name}, ${place.address}` : place.address;
}

/**
 * Looks `query` up. Throws on a network or service failure so callers can
 * tell "nothing found" (an empty list) from "couldn't look it up".
 */
export async function searchPlaces(
  query: string,
  fetchImpl: typeof fetch = fetch,
  userAgent = "Jim workout tracker",
): Promise<Place[]> {
  const cleaned = cleanPlaceQuery(query);
  if (!cleaned) return [];
  const response = await fetchImpl(placeSearchUrl(cleaned), {
    headers: { Accept: "application/json", "User-Agent": userAgent },
  });
  if (!response.ok) throw new Error(`Place lookup failed (${response.status})`);
  return parsePlaceResults(await response.json());
}
