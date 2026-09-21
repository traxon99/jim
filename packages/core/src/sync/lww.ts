import type { LwwRow } from "./types";

/**
 * Last-write-wins tie-break on (updatedAt, deviceId) per ADR-003. Used
 * identically on the client (applying a pulled row against what's locally
 * cached) and mirrored in SQL on the server (the push upsert's conflict
 * guard) — keep the two in lockstep if this ever changes.
 */
export function isNewerWrite(incoming: LwwRow, current: LwwRow): boolean {
  const incomingTime = incoming.updatedAt.getTime();
  const currentTime = current.updatedAt.getTime();
  if (incomingTime !== currentTime) {
    return incomingTime > currentTime;
  }
  return incoming.deviceId > current.deviceId;
}
