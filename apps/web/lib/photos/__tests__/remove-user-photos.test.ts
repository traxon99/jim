import { describe, expect, it } from "vitest";
import { type BucketAdmin, removeUserPhotoPrefix } from "../remove-user-photos";

/** A bucket double holding objects by path, listing them like Storage does (folders have a null id). */
function fakeBucket(objects: string[]) {
  const removed: string[] = [];
  const bucket: BucketAdmin = {
    async list(path) {
      const prefix = `${path}/`;
      const seen = new Map<string, string | null>();
      for (const object of objects.filter((o) => o.startsWith(prefix))) {
        const [head, ...rest] = object.slice(prefix.length).split("/");
        if (head) seen.set(head, rest.length > 0 ? null : object);
      }
      return { data: [...seen].map(([name, id]) => ({ name, id })), error: null };
    },
    async remove(paths) {
      removed.push(...paths);
      return { error: null };
    },
  };
  return { bucket, removed };
}

describe("removeUserPhotoPrefix", () => {
  it("removes every object under the user's prefix and no one else's", async () => {
    const { bucket, removed } = fakeBucket([
      "u1/p1/thumb.jpg",
      "u1/p1/original.jpg",
      "u1/p2/thumb.jpg",
      "u1/p2/original.jpg",
      "u10/p9/thumb.jpg",
      "u2/p3/thumb.jpg",
    ]);

    expect(await removeUserPhotoPrefix(bucket, "u1")).toBe(4);
    expect(removed.sort()).toEqual([
      "u1/p1/original.jpg",
      "u1/p1/thumb.jpg",
      "u1/p2/original.jpg",
      "u1/p2/thumb.jpg",
    ]);
  });

  it("does nothing for an account with no photos", async () => {
    const { bucket, removed } = fakeBucket(["u2/p3/thumb.jpg"]);
    expect(await removeUserPhotoPrefix(bucket, "u1")).toBe(0);
    expect(removed).toEqual([]);
  });

  it("surfaces a failed removal instead of reporting success", async () => {
    const { bucket } = fakeBucket(["u1/p1/thumb.jpg"]);
    bucket.remove = async () => ({ error: { message: "denied" } });
    await expect(removeUserPhotoPrefix(bucket, "u1")).rejects.toThrow("denied");
  });
});
