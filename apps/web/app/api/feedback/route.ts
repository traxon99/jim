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
 * "owner/repo" for the GitHub issue tracker feedback gets filed against
 * (see .env.example) — not necessarily this app's own repo.
 */
function feedbackRepo(): string {
  const repo = process.env.GITHUB_FEEDBACK_REPO;
  if (!repo) throw new Error("GITHUB_FEEDBACK_REPO is required (see .env.example)");
  return repo;
}

function feedbackToken(): string {
  const token = process.env.GITHUB_FEEDBACK_TOKEN;
  if (!token) throw new Error("GITHUB_FEEDBACK_TOKEN is required (see .env.example)");
  return token;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const email = data.claims.email ?? "unknown";

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

  let repo: string;
  let token: string;
  try {
    repo = feedbackRepo();
    token = feedbackToken();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Feedback is not configured" },
      { status: 500 },
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
      body: `${message.trim()}\n\n---\nSubmitted from Jim v${APP_VERSION} by ${email}.`,
      labels: ["feedback", FEEDBACK_TYPE_LABELS[type]],
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Failed to file feedback" }, { status: 502 });
  }

  const issue = (await response.json()) as { html_url?: string };
  return NextResponse.json({ url: issue.html_url });
}
