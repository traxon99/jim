import { describe, expect, it } from "vitest";
import { errorPage, loginFormPage } from "../pages";

describe("login pages", () => {
  it("escapes a client name that contains markup", () => {
    const html = loginFormPage("login-id", "<script>alert(1)</script>");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes a prefilled email address containing markup", () => {
    const html = loginFormPage("login-id", "jim client", "Wrong", '"><img src=x onerror=alert(1)>');
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

  it("asks for an email and a password", () => {
    const html = loginFormPage("abc-123", "jim client");
    expect(html).toContain('name="email"');
    expect(html).toContain('type="password" name="password"');
  });
});
