// Which signed-out requests may reach a share link. Anyone who opens one gets
// its read-only page (issue #638), and chat apps get the tags and image they
// build a preview from (issue #431). Nothing else under /share is public, and
// /api/shares still takes signing in.

const SHARE_PAGE = /^\/share\/[0-9a-f-]{36}\/?$/i;
const SHARE_IMAGE = /^\/share\/[0-9a-f-]{36}\/opengraph-image[^/]*$/i;

/** A share link's own page, `/share/<id>`. */
export function isSharePagePath(pathname: string): boolean {
  return SHARE_PAGE.test(pathname);
}

export function isPublicSharePath(pathname: string): boolean {
  return SHARE_PAGE.test(pathname) || SHARE_IMAGE.test(pathname);
}
