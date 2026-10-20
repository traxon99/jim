// Generated into public/sw.js by scripts/generate-sw.mjs (a postbuild step,
// not this file directly) — see that script for why a hand-rolled cache
// beats a bundler-plugin-based one here (Turbopack, Next 16's default
// bundler, doesn't support webpack plugins like Serwist's).
const CACHE_NAME = "jim-shell-__BUILD_ID__";
// Page HTML is per-user, so it lives in its own cache that sign-out deletes
// (lib/auth/sign-out.ts clearCachedPages, #289). Build output stays shared.
const PAGES_CACHE = "jim-pages-__BUILD_ID__";
const PRECACHE_URLS = __PRECACHE_URLS__;
const PRECACHE_PAGES = __PRECACHE_PAGES__;

// Safari refuses a redirected response for a navigation (#506), so a page is
// always stored as a fresh copy, under the URL it ended on: "/" signed in
// lands on /workout, signed out on /login.
function storablePage(response) {
  if (!response.ok || !response.url) return null;
  if (!(response.headers.get("content-type") || "").includes("text/html")) return null;
  return {
    key: new URL(response.url).pathname,
    response: new Response(response.clone().body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }),
  };
}

function precache() {
  return Promise.all([
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          fetch(url).then((response) => {
            if (!response.ok) throw new Error(`Precache of ${url} failed (${response.status})`);
            return cache.put(url, response);
          }),
        ),
      ),
    ),
    // Best effort: the shell must install even if a page can't be fetched.
    caches
      .open(PAGES_CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE_PAGES.map((url) =>
            fetch(url)
              .then((response) => {
                const page = storablePage(response);
                return page ? cache.put(page.key, page.response) : undefined;
              })
              .catch(() => {}),
          ),
        ),
      ),
  ]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== PAGES_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ---------------------------------------------------------------------------
// Web Push. The browser's push service wakes this worker even when no Jim
// tab or installed-app window is open. The page's own JS isn't running then,
// so everything a notification needs travels in the push payload
// (lib/pwa/notifications.ts's PushMessage, sent by
// scripts/send-release-push.ts and app/api/push/rest-timer/fire/route.ts).
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let message = {};
  if (event.data) {
    try {
      message = event.data.json();
    } catch {
      message = { body: event.data.text() };
    }
  }

  event.waitUntil(
    Promise.all([
      // Chrome and Safari require every push to show a notification
      // (userVisibleOnly), so this always shows one, even for an unexpected payload.
      self.registration
        .showNotification(message.title || "Jim", {
          body: message.body || "",
          icon: "/icons/192",
          badge: "/icons/192",
          tag: message.tag,
          data: { url: message.url || "/" },
        })
        .then(() => (message.tag === "jim-rest-timer" ? dismissIfJimIsOpen(message.tag) : null)),
      // A release push means a new sw.js is (or is about to be) live. Checking
      // now lets the new version download and precache in the background, so
      // it's already there when the user opens Jim. A failure here (offline,
      // deploy not aliased yet) is harmless; the normal on-open check still runs.
      message.tag === "jim-release" ? self.registration.update().catch(() => {}) : null,
    ]),
  );
});

// "Rest complete" while Jim is on screen: the in-app timer already showed it,
// so the banner dropping over the app is noise (#682). The push still had to
// show a notification, so close it straight away.
function dismissIfJimIsOpen(tag) {
  return self.clients.matchAll({ type: "window" }).then((windows) => {
    if (!windows.some((client) => client.visibilityState === "visible")) return;
    return self.registration.getNotifications({ tag }).then((shown) => {
      for (const notification of shown) notification.close();
    });
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (!existing) return self.clients.openWindow(target.href);
      // A running (or suspended) Jim is focused where it was left, so tell it
      // where the notification points; it routes there client-side
      // (components/register-service-worker.tsx), with no reload (#667).
      return existing.focus().then((focused) => {
        if (target.pathname === "/") return;
        (focused || existing).postMessage({
          type: "jim-navigate",
          path: target.pathname + target.search,
        });
      });
    }),
  );
});

// The push service can expire or rotate a subscription. Re-subscribe with
// the same options and tell the server, so pushes keep arriving without the
// user having to reopen Settings. Same-origin fetch, so the session cookie
// goes along; if the user is signed out this fails, and the next app load's
// syncPushSubscription (lib/pwa/push-client.ts) re-sends it instead.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const subscription =
        event.newSubscription ||
        (event.oldSubscription &&
          (await self.registration.pushManager.subscribe(event.oldSubscription.options)));
      if (!subscription) return;
      await fetch("/api/push/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
    })().catch(() => {}),
  );
});

const STATIC_PREFIXES = [
  "/_next/static/",
  "/icons/",
  "/splash/",
  "/icon",
  "/apple-icon",
  "/manifest.webmanifest",
  "/favicon.ico",
];

function isStaticAsset(pathname) {
  return STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Fresh HTML while online, kept for the next offline launch. Offline, the
    // page itself if it was cached, else the Workout tab: the app's real
    // landing page, since "/" only ever redirects to it (#661). Next's router
    // corrects the address bar to the page it rendered.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const page = storablePage(response);
          if (page) caches.open(PAGES_CACHE).then((cache) => cache.put(page.key, page.response));
          return response;
        })
        .catch(() =>
          caches.open(PAGES_CACHE).then((cache) =>
            cache
              .match(url.pathname)
              .then((cached) => cached || cache.match("/workout"))
              .then((cached) => cached || cache.match("/login")),
          ),
        ),
    );
    return;
  }

  // Cache-first only for immutable build output and PWA assets. Anything
  // else — /api/*, RSC payloads (?_rsc=), route handlers — is per-user and
  // must hit the network: a cached `/api/sync/pull?since=0` once served the
  // previous account's rows to whoever signed in next on the device (#289).
  if (!isStaticAsset(url.pathname)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
