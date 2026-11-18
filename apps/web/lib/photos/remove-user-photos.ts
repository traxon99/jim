import { PROGRESS_PHOTO_BUCKET } from "@jim/core";

/** The slice of a Supabase Storage bucket client (`storage.from(bucket)`) this needs. */
export interface BucketAdmin {
  list(
    path: string,
    options: { limit: number; offset: number },
  ): Promise<{
    data: { name: string; id: string | null }[] | null;
    error: { message: string } | null;
  }>;
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
}

const PAGE = 1000;

async function listAll(bucket: BucketAdmin, path: string) {
  const entries: { name: string; id: string | null }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(path, { limit: PAGE, offset });
    if (error) throw new Error(`Couldn't list ${path}: ${error.message}`);
    entries.push(...(data ?? []));
    if (!data || data.length < PAGE) return entries;
  }
}

/**
 * Removes every object under `progress-photos/<user_id>/` (issue #835). The
 * `users` cascade deletes a deleted account's metadata rows but knows nothing
 * of Storage, so the admin deletion script calls this first. Needs a bucket
 * client with the service role (the owner's own policies don't cover another
 * session). Returns how many objects were removed.
 */
export async function removeUserPhotoPrefix(bucket: BucketAdmin, userId: string): Promise<number> {
  const paths: string[] = [];
  for (const folder of await listAll(bucket, userId)) {
    // Each photo is a folder `<photo_id>/` holding its thumb and original.
    if (folder.id === null) {
      for (const file of await listAll(bucket, `${userId}/${folder.name}`)) {
        paths.push(`${userId}/${folder.name}/${file.name}`);
      }
    } else {
      paths.push(`${userId}/${folder.name}`);
    }
  }
  for (let start = 0; start < paths.length; start += PAGE) {
    const { error } = await bucket.remove(paths.slice(start, start + PAGE));
    if (error) throw new Error(`Couldn't remove photos: ${error.message}`);
  }
  return paths.length;
}

export { PROGRESS_PHOTO_BUCKET };
