/**
 * The whole login UI, in one file: a couple of tiny, self-contained HTML
 * pages for the OAuth authorize → email/password sign-in step (see
 * provider.ts and login-routes.ts). No client framework, no build step —
 * this is a few kilobytes of markup rendered by a personal-use auth server.
 */

const STYLE = `
  body { font: 16px/1.5 -apple-system, system-ui, sans-serif; max-width: 28rem; margin: 4rem auto; padding: 0 1.5rem; color: #18181b; }
  h1 { font-size: 1.25rem; }
  input { font-size: 16px; padding: 0.6rem 0.75rem; width: 100%; box-sizing: border-box; border: 1px solid #d4d4d8; border-radius: 0.5rem; margin: 0.75rem 0; }
  button { font-size: 16px; padding: 0.6rem 1rem; border-radius: 0.5rem; border: none; background: #18181b; color: white; cursor: pointer; }
  p.muted { color: #71717a; font-size: 0.9rem; }
  p.error { color: #b91c1c; }
`;

/** Every value interpolated into these templates is either user-entered (email) or client-supplied (DCR's client_name) — never trust it verbatim. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — jim</title>
<style>${STYLE}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function loginFormPage(
  loginId: string,
  clientName: string | undefined,
  error?: string,
  email = "",
): string {
  return page(
    "Sign in",
    `
<h1>Sign in to jim</h1>
<p class="muted">${escapeHtml(clientName ?? "An application")} wants to read and manage your training data.</p>
${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
<form method="POST" action="/login">
  <input type="hidden" name="login" value="${escapeHtml(loginId)}">
  <input type="email" name="email" value="${escapeHtml(email)}" placeholder="you@example.com" required ${email ? "" : "autofocus "}autocomplete="username">
  <input type="password" name="password" placeholder="Password" required ${email ? "autofocus " : ""}autocomplete="current-password">
  <button type="submit">Sign in</button>
</form>
<p class="muted">Use the same email and password as the jim app.</p>
`,
  );
}

export function errorPage(message: string): string {
  return page("Error", `<h1>Sign-in failed</h1><p class="error">${escapeHtml(message)}</p>`);
}
