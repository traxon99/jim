import { createHash } from "node:crypto";
import { claimFeedbackSlot } from "@/lib/feedback/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { APP_VERSION } from "@/lib/version";
import { NextResponse } from "next/server";

const MAX_MESSAGE_LENGTH = 4000;

/** Feedback types the UI offers, and the GitHub label each files under alongside "feedback". */
const FEEDBACK_TYPE_LABELS = {
  bug: "bug",
  feature: "enhancement",
  question: "question",
} as const;

type FeedbackType = keyof typeof FEEDBACK_TYPE_LABELS;

function isFeedbackType(value: unknown): value is FeedbackType {
  return typeof value === "string" && value in FEEDBACK_TYPE_LABELS;
}

/**
 * A short, stable tag for the submitter (issue #504). The issue tracker may
 * be public, so it carries this instead of the user's email; the maintainer
 * can match it to an account by hashing the user id the same way.
 */
function submitterTag(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const userId = data.claims.sub;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, type } = (body ?? {}) as { message?: unknown; type?: unknown };
  if (typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "message is too long" }, { status: 400 });
  }
  if (!isFeedbackType(type)) {
    return NextResponse.json({ error: "type is required" }, { status: 400 });
  }

  // "owner/repo" of the tracker feedback is filed against (see .env.example),
  // not necessarily this app's own repo. Which variable is missing goes to
  // the server log, not to the client (issue #504).
  const repo = process.env.GITHUB_FEEDBACK_REPO;
  const token = process.env.GITHUB_FEEDBACK_TOKEN;
  if (!repo || !token) {
    console.error("[feedback] GITHUB_FEEDBACK_REPO and GITHUB_FEEDBACK_TOKEN are required");
    return NextResponse.json({ error: "Feedback is not configured" }, { status: 500 });
  }

  if (!(await claimFeedbackSlot())) {
    return NextResponse.json(
      { error: "You've sent a lot of feedback this hour. Try again later." },
      { status: 429 },
    );
  }

  const title = message.trim().split("\n")[0]?.slice(0, 80) || "App feedback";
  const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({
      title,
      body: `${message.trim()}\n\n---\nSubmitted from Jim v${APP_VERSION} by user ${submitterTag(userId)}.`,
      labels: ["feedback", FEEDBACK_TYPE_LABELS[type]],
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Failed to file feedback" }, { status: 502 });
  }

  const issue = (await response.json()) as { html_url?: string };
  return NextResponse.json({ url: issue.html_url });
}
