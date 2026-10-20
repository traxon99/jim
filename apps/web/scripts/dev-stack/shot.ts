import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type Page, chromium } from "playwright-core";
import { DEV_USER } from "./seed";

/**
 * `pnpm dev:shot <path> [out.png] [--dark] [--keep-open]`: opens the running
 * dev stack as an installed iPhone app (393×852, touch, display-mode
 * standalone), signs in as the seeded user, goes to <path> and screenshots
 * it. Exported `openApp` is the same thing for a script that needs to tap
 * around first (docs/PWA.md §10).
 */

const BASE_URL = process.env.DEV_STACK_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

export async function openApp(options: { dark?: boolean } = {}) {
  const executablePath = process.env.CHROMIUM_PATH ?? defaultChromium();
  const browser = await chromium.launch({
    executablePath,
    // Only HTTPS goes through an agent proxy, so localhost stays direct.
    args: process.env.HTTPS_PROXY
      ? [`--proxy-server=https=${new URL(process.env.HTTPS_PROXY).host}`]
      : [],
  });
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: options.dark ? "dark" : "light",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  // The installed-app path. Chromium can't emulate display-mode, and the app
  // decides it in JS (lib/pwa/standalone.ts sets body.pwa), so answer the
  // same two questions an installed iPhone app does.
  await context.addInitScript(() => {
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (!query.includes("display-mode")) return matchMedia(query);
      const standalone = query.includes("standalone");
      const result = matchMedia(standalone ? "(min-width: 0px)" : "(max-width: 0px)");
      return Object.defineProperty(result, "media", { value: query });
    };
    Object.defineProperty(window.navigator, "standalone", { value: true });
  });
  const page = await context.newPage();
  await signIn(page);
  return { browser, page };
}

/**
 * Loads `route` and waits until the app is on screen and synced (the boot
 * splash, lib/boot/gate.ts, then the remaining pull pages). Hides Next's dev
 * badge so screenshots match the installed app.
 */
export async function goTo(page: Page, route: string) {
  await page.goto(`${BASE_URL}${route}`);
  await page.locator(".loading-screen").waitFor({ state: "detached", timeout: 60_000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  // The splash lifts after the first pull page; the rest of the 900-row
  // catalog arrives in later pages, and until then rows naming those
  // exercises read "Exercise".
  await page.waitForTimeout(4000);
}

async function signIn(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.locator("input#email").fill(DEV_USER.email);
  await page.locator("input#password").fill(DEV_USER.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

/** The cloud containers' preinstalled Chromium; elsewhere, Playwright's own (`npx playwright install chromium`). */
function defaultChromium(): string | undefined {
  const preinstalled = "/opt/pw-browsers/chromium";
  return existsSync(preinstalled) ? preinstalled : undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const route = args[0] ?? "/";
  // pnpm runs this from apps/web; INIT_CWD is where the command was typed.
  const out = args[1]
    ? path.resolve(process.env.INIT_CWD ?? process.cwd(), args[1])
    : path.join(tmpdir(), "jim-dev-shots", `${route.replaceAll("/", "_") || "_"}.png`);
  const { browser, page } = await openApp({ dark: process.argv.includes("--dark") });
  await goTo(page, route);
  mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  console.log(`[dev-shot] ${route} → ${out}`);
  await browser.close();
}
