import { describe, expect, it } from "vitest";
import { resolveCurrentRows } from "../supersede";

interface Row {
  id: string;
  supersedesId: string | null;
  weight: number;
}

describe("resolveCurrentRows", () => {
  it("returns a lone row with no chain", () => {
    const rows: Row[] = [{ id: "a", supersedesId: null, weight: 100 }];
    expect(resolveCurrentRows(rows)).toEqual(rows);
  });

  it("resolves a two-row chain to the newer row", () => {
    const original: Row = { id: "a", supersedesId: null, weight: 100 };
    const edit: Row = { id: "b", supersedesId: "a", weight: 105 };
    expect(resolveCurrentRows([original, edit])).toEqual([edit]);
  });

  it("resolves a three-row chain to only the last row", () => {
    const v1: Row = { id: "a", supersedesId: null, weight: 100 };
    const v2: Row = { id: "b", supersedesId: "a", weight: 105 };
    const v3: Row = { id: "c", supersedesId: "b", weight: 110 };
    expect(resolveCurrentRows([v1, v2, v3])).toEqual([v3]);
  });

  it("resolves independent chains for unrelated entities", () => {
    const setA1: Row = { id: "a1", supersedesId: null, weight: 100 };
    const setA2: Row = { id: "a2", supersedesId: "a1", weight: 105 };
    const setB1: Row = { id: "b1", supersedesId: null, weight: 200 };
    expect(resolveCurrentRows([setA1, setA2, setB1])).toEqual([setA2, setB1]);
  });

  it("is order-independent", () => {
    const v1: Row = { id: "a", supersedesId: null, weight: 100 };
    const v2: Row = { id: "b", supersedesId: "a", weight: 105 };
    expect(resolveCurrentRows([v2, v1])).toEqual([v2]);
  });

  it("returns an empty array for no rows", () => {
    expect(resolveCurrentRows([])).toEqual([]);
  });
});
