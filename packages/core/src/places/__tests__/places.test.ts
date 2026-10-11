import { describe, expect, it, vi } from "vitest";
import {
  cleanPlaceQuery,
  gymCoordinates,
  isValidCoordinate,
  parsePlaceResults,
  placeLabel,
  placeSearchUrl,
  searchPlaces,
} from "../index";

const GOLDS = {
  type: "Feature",
  properties: {
    name: "Gold's Gym",
    housenumber: "360",
    street: "Hampton Drive",
    city: "Los Angeles",
    state: "California",
    postcode: "90291",
    country: "United States",
  },
  geometry: { type: "Point", coordinates: [-118.4719, 33.9971] },
};

describe("places (#462)", () => {
  it("parses Photon features into one-line addresses", () => {
    const places = parsePlaceResults({ features: [GOLDS] });
    expect(places).toEqual([
      {
        name: "Gold's Gym",
        address: "360 Hampton Drive, Los Angeles, California 90291, United States",
        latitude: 33.9971,
        longitude: -118.4719,
      },
    ]);
    expect(places[0] && placeLabel(places[0])).toBe(
      "Gold's Gym, 360 Hampton Drive, Los Angeles, California 90291, United States",
    );
  });

  it("drops features without coordinates, duplicates and junk", () => {
    const noCoords = { ...GOLDS, geometry: { type: "Point" } };
    const badCoords = { ...GOLDS, geometry: { coordinates: [500, 33] } };
    expect(parsePlaceResults({ features: [GOLDS, GOLDS, noCoords, badCoords] })).toHaveLength(1);
    expect(parsePlaceResults(null)).toEqual([]);
    expect(parsePlaceResults({ features: "nope" })).toEqual([]);
  });

  it("uses the name alone when there's no address, and no name when it's just the street", () => {
    const park = {
      properties: { name: "Muscle Beach" },
      geometry: { coordinates: [-118.47, 33.98] },
    };
    expect(parsePlaceResults({ features: [park] })[0]).toMatchObject({
      name: null,
      address: "Muscle Beach",
    });
    const street = {
      properties: { name: "Main Street", street: "Main Street", city: "Springfield" },
      geometry: { coordinates: [-89.6, 39.8] },
    };
    expect(parsePlaceResults({ features: [street] })[0]).toMatchObject({
      name: null,
      address: "Main Street, Springfield",
    });
  });

  it("validates coordinates", () => {
    expect(isValidCoordinate(45, 120)).toBe(true);
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(0, -181)).toBe(false);
    expect(isValidCoordinate(Number.NaN, 0)).toBe(false);
    expect(isValidCoordinate(null, 0)).toBe(false);
    expect(gymCoordinates({ latitude: 1, longitude: 2 })).toEqual({ latitude: 1, longitude: 2 });
    expect(gymCoordinates({ latitude: 1, longitude: null })).toBeNull();
    expect(gymCoordinates({})).toBeNull();
  });

  it("skips queries too short to look up and encodes the rest", async () => {
    expect(cleanPlaceQuery("  ab ")).toBeNull();
    expect(cleanPlaceQuery(" gold's ")).toBe("gold's");
    expect(placeSearchUrl("a&b c")).toContain("q=a%26b+c");

    const fetchImpl = vi.fn();
    expect(await searchPlaces("ab", fetchImpl)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("searches, and throws when the service fails", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ features: [GOLDS] })));
    expect(await searchPlaces("golds gym venice", ok)).toHaveLength(1);
    const down = vi.fn(async () => new Response("", { status: 503 }));
    await expect(searchPlaces("golds gym venice", down)).rejects.toThrow(/503/);
  });
});
