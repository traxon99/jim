/**
 * The whole login UI, in one file: a handful of tiny, self-contained HTML
 * pages for the OAuth authorize → magic-link → callback bridge (see
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
): string {
  return page(
    "Sign in",
    `
<h1>Sign in to jim</h1>
<p class="muted">${escapeHtml(clientName ?? "An application")} wants to read and manage your training data.</p>
${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
<form method="POST" action="/login">
  <input type="hidden" name="login" value="${escapeHtml(loginId)}">
  <input type="email" name="email" placeholder="you@example.com" required autofocus autocomplete="email">
  <button type="submit">Send magic link</button>
</form>
`,
  );
}

export function checkEmailPage(email: string): string {
  return page(
    "Check your email",
    `
<h1>Check your email</h1>
<p>We sent a sign-in link to <strong>${escapeHtml(email)}</strong>. Open it on this device to finish signing in.</p>
`,
  );
}

/**
 * Supabase's magic link redirects here with tokens in the URL *fragment*
 * (`#access_token=...`), which never reaches the server — only inline JS in
 * the browser can read it. This page reads the fragment, forwards it to
 * `POST /login/callback`, and then navigates to whatever redirect that
 * returns (the original OAuth client's `redirect_uri`, with `code`/`state`).
 */
export function callbackBridgePage(loginId: string): string {
  return page(
    "Signing in…",
    `
<h1>Signing in…</h1>
<p class="muted" id="status">Completing sign-in.</p>
<script>
  (function () {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    var accessToken = params.get("access_token");
    var refreshToken = params.get("refresh_token");
    var status = document.getElementById("status");

    if (params.get("error")) {
      status.textContent = params.get("error_description") || params.get("error");
      status.className = "error";
      return;
    }
    if (!accessToken || !refreshToken) {
      status.textContent = "This link is missing its sign-in tokens. Request a new one.";
      status.className = "error";
      return;
    }

    fetch("/login/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: ${JSON.stringify(loginId)},
        access_token: accessToken,
        refresh_token: refreshToken,
      }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.redirect) {
          window.location.replace(data.redirect);
        } else {
          status.textContent = data.error_description || "Sign-in failed.";
          status.className = "error";
        }
      })
      .catch(function () {
        status.textContent = "Sign-in failed. Request a new link.";
        status.className = "error";
      });
  })();
</script>
`,
  );
}

export function errorPage(message: string): string {
  return page("Error", `<h1>Sign-in failed</h1><p class="error">${escapeHtml(message)}</p>`);
}
