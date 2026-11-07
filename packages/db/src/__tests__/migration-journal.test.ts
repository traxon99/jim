import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Drizzle's migrator only runs a migration whose journal `when` is newer than the
// newest one already applied. A hand-authored migration with an older `when` is
// silently skipped in production (#775: the `heart` reaction enum value).
const dir = join(__dirname, "../../drizzle");
const journal = JSON.parse(readFileSync(join(dir, "meta/_journal.json"), "utf8")) as {
  entries: { idx: number; tag: string; when: number }[];
};

describe("drizzle migration journal", () => {
  it("has strictly increasing `when` timestamps", () => {
    for (let i = 1; i < journal.entries.length; i++) {
      const prev = journal.entries[i - 1];
      const entry = journal.entries[i];
      if (!prev || !entry) continue;
      expect(entry.when, `${entry.tag} must be newer than ${prev.tag}`).toBeGreaterThan(prev.when);
    }
  });

  it("has an entry for every .sql file", () => {
    const tags = new Set(journal.entries.map((e) => e.tag));
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
      expect(tags.has(file.replace(/\.sql$/, "")), `${file} missing from journal`).toBe(true);
    }
  });
});
