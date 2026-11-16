"use server";

import {
  adminRequestAppUpdate,
  adminRequestLocalReset,
  sendRefreshPush,
} from "@/lib/admin/force-refresh";
import { requireAdmin } from "@/lib/admin/load-access";
import {
  type AdminActionResult,
  adminSetRole,
  adminSetSignInDisabled,
  adminUpdateProfile,
  adminUpdateSettings,
  recordPasswordReset,
} from "@/lib/admin/user-actions";
import { serviceDb } from "@/lib/db/user-scoped";
import { configureWebPush, webpush } from "@/lib/pwa/web-push-server";
import { supabaseEnv } from "@/lib/supabase/env";
import { users } from "@jim/db";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

// Server Functions behind the admin user page (issue #807). Each checks the
// caller is an admin on an aal2 session itself: a Server Function is its own
// endpoint, reachable without the page that renders it.

function done(userId: string, result: AdminActionResult): AdminActionResult {
  if (result.ok) revalidatePath(`/admin/users/${userId}`);
  return result;
}

export async function updateUserSettings(
  userId: string,
  patch: unknown,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  return done(userId, await adminUpdateSettings(serviceDb(), { id: admin.userId }, userId, patch));
}

export async function updateUserProfile(
  userId: string,
  patch: unknown,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  return done(userId, await adminUpdateProfile(serviceDb(), { id: admin.userId }, userId, patch));
}

export async function setUserRole(userId: string, role: unknown): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  return done(userId, await adminSetRole(serviceDb(), { id: admin.userId }, userId, role));
}

export async function setSignInDisabled(
  userId: string,
  disabled: boolean,
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  try {
    return done(
      userId,
      await adminSetSignInDisabled(serviceDb(), { id: admin.userId }, userId, disabled === true),
    );
  } catch (error) {
    console.error("[admin] setSignInDisabled failed:", error);
    return { ok: false, error: "Couldn't change sign-in. Try again." };
  }
}

/** Emails the user a password reset link, the same one Forgot password sends. */
export async function sendPasswordReset(userId: string): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const [row] = await serviceDb()
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) return { ok: false, error: "No such account" };

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  const redirectTo = new URL("/auth/confirm", `${proto}://${host}`);
  redirectTo.searchParams.set("next", "/reset-password");

  // A one-off client: the admin's own session cookies must not carry this
  // request, and nothing about it should be stored.
  const { url, anonKey } = supabaseEnv();
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
  });
  const { error } = await supabase.auth.resetPasswordForEmail(row.email, {
    redirectTo: redirectTo.toString(),
  });
  if (error) return { ok: false, error: "Couldn't send the email. Try again later." };
  await recordPasswordReset(serviceDb(), { id: admin.userId }, userId);
  return done(userId, { ok: true });
}

/**
 * "Update app" for one account, or for everyone when `userId` is null
 * (issue #808): stamps the request, then sends the silent push.
 */
export async function requestAppUpdate(userId: string | null): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const db = serviceDb();
  const result = await adminRequestAppUpdate(db, { id: admin.userId }, userId);
  if (!result.ok) return result;
  if (configureWebPush()) {
    await sendRefreshPush(db, userId, (sub, payload) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        // One per device however often it's pressed; stale after an hour,
        // when the next sync has picked the request up anyway.
        { TTL: 60 * 60, topic: "jim-refresh", urgency: "normal" },
      ),
    ).catch((error: unknown) => console.error("[admin] refresh push failed:", error));
  }
  if (userId) return done(userId, result);
  revalidatePath("/admin/users");
  return result;
}

/** "Reset local data" for one account (issue #808). */
export async function requestLocalReset(userId: string): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  return done(userId, await adminRequestLocalReset(serviceDb(), { id: admin.userId }, userId));
}
