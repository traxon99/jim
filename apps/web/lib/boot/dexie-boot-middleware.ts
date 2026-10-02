import type { DBCore, Middleware } from "dexie";
import { registerBootTask } from "./ready";

function track<T>(promise: Promise<T>): Promise<T> {
  const done = registerBootTask();
  return promise.finally(done);
}

/**
 * Dexie middleware that registers every IndexedDB read and write as a boot
 * task while it's in flight. Every screen reads its data through
 * `useLiveQuery`, so this holds the boot splash (lib/boot/gate.ts) until the
 * visible screen's queries have actually returned, without each component
 * having to opt in. Gaps between one query landing and the next starting are
 * covered by the gate's quiet-DOM wait.
 */
export const bootQueryMiddleware: Middleware<DBCore> = {
  stack: "dbcore",
  name: "bootQuery",
  create(down) {
    return {
      ...down,
      table(name) {
        const table = down.table(name);
        return {
          ...table,
          get: (req) => track(table.get(req)),
          getMany: (req) => track(table.getMany(req)),
          query: (req) => track(table.query(req)),
          openCursor: (req) => track(table.openCursor(req)),
          count: (req) => track(table.count(req)),
          mutate: (req) => track(table.mutate(req)),
        };
      },
    };
  },
};
