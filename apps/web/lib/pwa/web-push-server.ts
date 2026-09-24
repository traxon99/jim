import webpush from "web-push";

/**
 * Configures web-push's VAPID details from the environment (see
 * .env.example). Returns false when the keys aren't set, which means push
 * is unavailable on this deployment, not broken.
 */
export function configureWebPush(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const subject =
    process.env.VAPID_SUBJECT || (productionHost ? `https://${productionHost}` : undefined);
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export { webpush };
