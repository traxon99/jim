import { createClient } from "@/lib/supabase/server";
import { PROGRESS_PHOTO_BUCKET, type SyncTable, photoObjectPaths } from "@jim/core";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PushedMutation {
  table: SyncTable;
  entity: Record<string, unknown>;
}

/**
 * The photos a push just deleted (issue #835): applied (or already-applied)
 * progress-photo mutations that carry a tombstone. The objects' paths are rebuilt from the
 * verified user and the photo id rather than read from the payload, so a
 * client can't point the removal at another path.
 */
export function deletedPhotoIds(
  mutations: readonly PushedMutation[],
  statuses: readonly string[],
): string[] {
  const ids: string[] = [];
  mutations.forEach((mutation, index) => {
    // "duplicate" too: a retry of a push that committed but never finished
    // removing the objects. Removing an object that is already gone is harmless.
    const status = statuses[index];
    if (mutation.table !== "progressPhotos" || (status !== "applied" && status !== "duplicate")) {
      return;
    }
    if (!mutation.entity.deletedAt) return;
    const id = mutation.entity.id;
    if (typeof id === "string" && UUID.test(id)) ids.push(id);
  });
  return [...new Set(ids)];
}

/**
 * Removes both Storage objects of each deleted photo, as the signed-in user:
 * the bucket's delete policy only lets them touch their own prefix. Best
 * effort. A failure is logged and never fails the push, because the tombstone
 * is already committed and the row is gone from every screen.
 */
export async function removePhotoObjects(userId: string, photoIds: readonly string[]) {
  if (photoIds.length === 0) return;
  try {
    const supabase = await createClient();
    const paths = photoIds.flatMap((id) => {
      const { thumbPath, originalPath } = photoObjectPaths(userId, id);
      return [thumbPath, originalPath];
    });
    const { error } = await supabase.storage.from(PROGRESS_PHOTO_BUCKET).remove(paths);
    if (error) console.error("[sync/push] removing photo objects failed:", error.message);
  } catch (error) {
    console.error("[sync/push] removing photo objects failed:", error);
  }
}
