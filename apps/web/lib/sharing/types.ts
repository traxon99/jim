import type { ShareKind, ShareSnapshot } from "@jim/core";

/** One of the signed-in user's own share links, for the list they revoke from. */
export interface OwnShareLink {
  id: string;
  kind: ShareKind;
  name: string;
  createdAt: string;
}

/** A share link as anyone signed in sees it when they open it. */
export interface OpenedShareLink {
  id: string;
  kind: ShareKind;
  name: string;
  snapshot: ShareSnapshot;
  createdAt: string;
  /** The sharer's username. */
  username: string | null;
  isMine: boolean;
}
