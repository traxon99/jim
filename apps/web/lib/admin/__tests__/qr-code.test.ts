import { describe, expect, it } from "vitest";
import { qrCodeSrc } from "../qr-code";

describe("qrCodeSrc", () => {
  it("encodes Supabase's raw SVG data URL", () => {
    expect(qrCodeSrc('data:image/svg+xml;utf-8,<svg a="1"/>')).toBe(
      "data:image/svg+xml;charset=utf-8,%3Csvg%20a%3D%221%22%2F%3E",
    );
  });

  it("doesn't double-encode an already encoded payload", () => {
    expect(qrCodeSrc("data:image/svg+xml;utf-8,%3Csvg%2F%3E")).toBe(
      "data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E",
    );
  });

  it("leaves any other URL alone", () => {
    expect(qrCodeSrc("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
  });
});
