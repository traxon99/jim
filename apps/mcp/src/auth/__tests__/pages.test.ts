import { describe, expect, it } from "vitest";
import { checkEmailPage, errorPage, loginFormPage } from "../pages";

describe("login pages", () => {
  it("escapes a client name that contains markup", () => {
    const html = loginFormPage("login-id", "<script>alert(1)</script>");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes an email address containing markup", () => {
    const html = checkEmailPage('"><img src=x onerror=alert(1)>@example.com');
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
  });

  it("escapes an error message containing markup", () => {
    const html = errorPage("<b>boom</b>");
    expect(html).not.toContain("<b>boom</b>");
  });

  it("embeds the login id in the hidden form field", () => {
    const html = loginFormPage("abc-123", "jim client");
    expect(html).toContain('value="abc-123"');
  });
});
