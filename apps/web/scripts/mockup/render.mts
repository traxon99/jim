import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

/**
 * `pnpm mockup:render <page.html> <out.png> [--dark] [--width=393] [--height=852] [--full]`:
 * renders a local mockup or comparison board to a PNG at 2x. `--dark` loads the
 * page with `?dark` and a dark color scheme, so a page can theme off either.
 * `--full` captures the whole page height (boards); otherwise one phone screen.
 */

const argv = process.argv.slice(2);
const flag = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
const [input, output] = argv.filter((arg) => !arg.startsWith("--"));
if (!input || !output) {
  console.error(
    "usage: pnpm mockup:render <page.html> <out.png> [--dark] [--width=N] [--height=N] [--full]",
  );
  process.exit(1);
}

// pnpm runs this from apps/web; INIT_CWD is where the command was typed.
const cwd = process.env.INIT_CWD ?? process.cwd();
const dark = argv.includes("--dark");
const [file, query = ""] = input.split("?");
const url = pathToFileURL(path.resolve(cwd, file));
url.search = query;
if (dark) url.searchParams.set("dark", "");
const out = path.resolve(cwd, output);
mkdirSync(path.dirname(out), { recursive: true });

const preinstalled = "/opt/pw-browsers/chromium";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ?? (existsSync(preinstalled) ? preinstalled : undefined),
});
const page = await browser.newPage({
  viewport: { width: Number(flag("width") ?? 393), height: Number(flag("height") ?? 852) },
  deviceScaleFactor: 2,
  colorScheme: dark ? "dark" : "light",
});
await page.goto(url.href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, fullPage: argv.includes("--full") });
await browser.close();
console.log(out);
