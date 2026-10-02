import { describe, expect, it } from "vitest";
import { centerSquare } from "../avatar-image";

describe("centerSquare", () => {
  it("crops a portrait photo's top and bottom equally", () => {
    expect(centerSquare(300, 500)).toEqual({ x: 0, y: 100, size: 300 });
  });

  it("crops a landscape photo's sides equally", () => {
    expect(centerSquare(800, 600)).toEqual({ x: 100, y: 0, size: 600 });
  });
});
