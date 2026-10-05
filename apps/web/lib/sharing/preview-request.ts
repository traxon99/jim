// Which signed-out requests may reach a share link (issue #431): the chat apps
// that fetch a pasted link to build its preview. Everyone else still goes
// through sign-in, and what a preview fetch gets is only the page's tags and
// image (app/(shell)/share/[id]), never the routine itself.

const SHARE_PAGE = /^\/share\/[0-9a-f-]{36}\/?$/i;
const SHARE_IMAGE = /^\/share\/[0-9a-f-]{36}\/opengraph-image[^/]*$/i;

/**
 * Link-preview fetchers by user agent. iMessage sends "facebookexternalhit"
 * and "Twitterbot"; the rest name themselves.
 */
const PREVIEW_BOTS =
  /facebookexternalhit|Facebot|Twitterbot|Slackbot|Discordbot|WhatsApp|TelegramBot|LinkedInBot|SkypeUriPreview|redditbot|Mastodon|Bluesky|Iframely|Embedly/i;

export function isSharePreviewRequest(pathname: string, userAgent: string | null): boolean {
  // The preview image carries nothing the page's tags don't, and some apps
  // fetch it with a plain browser user agent.
  if (SHARE_IMAGE.test(pathname)) return true;
  return SHARE_PAGE.test(pathname) && userAgent != null && PREVIEW_BOTS.test(userAgent);
}
