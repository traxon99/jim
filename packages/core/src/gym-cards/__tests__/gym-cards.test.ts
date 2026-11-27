import { describe, expect, it } from "vitest";
import {
  cleanGymCardCode,
  gs1CheckDigit,
  gymCardCodeError,
  gymCardMonogram,
  isSquareFormat,
  scannedCode,
  sortGymCards,
} from "..";

describe("scannedCode (#878)", () => {
  it("maps BarcodeDetector and zxing format names", () => {
    expect(scannedCode("detector", "code_39", "00048213")).toEqual({
      format: "code39",
      code: "00048213",
    });
    expect(scannedCode("zxing", "QRCode", "NSA:7731")).toEqual({ format: "qr", code: "NSA:7731" });
    expect(scannedCode("zxing", "Codabar", "A40156B")).toEqual({
      format: "codabar",
      code: "A40156B",
    });
  });

  it("keeps an EAN-13 that starts with 0 as the UPC-A it is", () => {
    expect(scannedCode("zxing", "EAN13", "0036000291452")).toEqual({
      format: "upca",
      code: "036000291452",
    });
    expect(scannedCode("zxing", "EAN13", "4006381333931")?.format).toBe("ean13");
  });

  it("ignores formats Jim doesn't keep and empty reads", () => {
    expect(scannedCode("zxing", "MaxiCode", "x")).toBeNull();
    expect(scannedCode("detector", "qr_code", "")).toBeNull();
  });
});

describe("gymCardCodeError", () => {
  it("checks retail check digits", () => {
    expect(gs1CheckDigit("400638133393")).toBe(1);
    expect(gymCardCodeError("ean13", "4006381333931")).toBeNull();
    expect(gymCardCodeError("ean13", "4006381333932")).toMatch(/last digit/);
    expect(gymCardCodeError("ean13", "400638133393")).toBeNull();
    expect(gymCardCodeError("upca", "036000291452")).toBeNull();
    expect(gymCardCodeError("ean8", "1234")).toMatch(/7 or 8/);
  });

  it("checks each linear format's characters", () => {
    expect(gymCardCodeError("itf", "00482137")).toBeNull();
    expect(gymCardCodeError("itf", "123")).toMatch(/even/);
    expect(gymCardCodeError("codabar", "A40156B")).toBeNull();
    expect(gymCardCodeError("codabar", "40156")).not.toBeNull();
    expect(gymCardCodeError("code39", "MBR-0048")).toBeNull();
    expect(gymCardCodeError("code128", "Ω")).not.toBeNull();
    expect(gymCardCodeError("qr", "anything ✓")).toBeNull();
    expect(gymCardCodeError("qr", "")).toMatch(/Enter/);
  });
});

describe("cleanGymCardCode", () => {
  it("trims, uppercases Code 39 and adds Codabar's start and stop", () => {
    expect(cleanGymCardCode("code39", " mbr-0048 ")).toBe("MBR-0048");
    expect(cleanGymCardCode("codabar", "40156")).toBe("A40156B");
    expect(cleanGymCardCode("codabar", "c40156d")).toBe("C40156D");
    expect(cleanGymCardCode("qr", " Keep Case ")).toBe("Keep Case");
  });
});

describe("card helpers", () => {
  it("makes a monogram from the first two words", () => {
    expect(gymCardMonogram("Iron Temple")).toBe("IT");
    expect(gymCardMonogram("  northside ")).toBe("N");
    expect(gymCardMonogram("24 Hour Fitness")).toBe("2H");
    expect(gymCardMonogram("")).toBe("?");
  });

  it("draws QR, Data Matrix and Aztec square", () => {
    expect(isSquareFormat("qr")).toBe(true);
    expect(isSquareFormat("pdf417")).toBe(false);
    expect(isSquareFormat("code39")).toBe(false);
  });

  it("sorts live cards by position, then age", () => {
    const at = (n: number) => new Date(2026, 0, n);
    const rows = [
      { id: "b", position: 1, createdAt: at(1), deletedAt: null },
      { id: "gone", position: 0, createdAt: at(1), deletedAt: at(2) },
      { id: "a2", position: 0, createdAt: at(3), deletedAt: null },
      { id: "a1", position: 0, createdAt: at(2), deletedAt: null },
    ];
    expect(sortGymCards(rows).map((row) => row.id)).toEqual(["a1", "a2", "b"]);
  });
});
