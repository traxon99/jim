import { describe, expect, it } from "vitest";
import { errorPage, loginFormPage } from "../pages";

describe("login pages", () => {
  it("escapes a client name that contains markup", () => {
    const html = loginFormPage({
      loginId: "login-id",
      clientName: "<script>alert(1)</script>",
      redirectUri: "https://client.example/callback",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes a prefilled email address containing markup", () => {
    const html = loginFormPage({
      loginId: "login-id",
      clientName: "jim client",
      redirectUri: "https://client.example/callback",
      error: "Wrong",
      email: '"><img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
  });

  it("escapes an error message containing markup", () => {
    const html = errorPage("<b>boom</b>");
    expect(html).not.toContain("<b>boom</b>");
  });

  it("embeds the login id in the hidden form field", () => {
    const html = loginFormPage({
      loginId: "abc-123",
      clientName: "jim client",
      redirectUri: "https://client.example/callback",
    });
    expect(html).toContain('value="abc-123"');
  });

  it("asks for an email and a password", () => {
    const html = loginFormPage({
      loginId: "abc-123",
      clientName: "jim client",
      redirectUri: "https://client.example/callback",
    });
    expect(html).toContain('name="email"');
    expect(html).toContain('type="password" name="password"');
  });

  it("names the host the code goes to, whatever the client calls itself (#509)", () => {
    const html = loginFormPage({
      loginId: "abc-123",
      clientName: "Claude",
      redirectUri: "https://evil.example/cb?x=1",
    });
    expect(html).toContain("<strong>evil.example</strong>");
    expect(html).toContain("Sign in and allow access");
  });
});
