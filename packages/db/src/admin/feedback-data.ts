import { type DbOrTx, users } from "../index";
import { parseSubmitterTag, submitterTag } from "./submitter-tag";

/** The feedback types the in-app form files, by their GitHub label. */
export const FEEDBACK_TYPES = [
  { id: "bug", label: "Bug" },
  { id: "enhancement", label: "Feature" },
  { id: "question", label: "Question" },
] as const;
export type FeedbackTypeId = (typeof FEEDBACK_TYPES)[number]["id"];

export const FEEDBACK_STATES = [
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
] as const;
export type FeedbackStateId = (typeof FEEDBACK_STATES)[number]["id"];

export function pickFeedbackType(value: string | string[] | undefined): FeedbackTypeId | null {
  const id = Array.isArray(value) ? value[0] : value;
  return FEEDBACK_TYPES.find((type) => type.id === id)?.id ?? null;
}

export function pickFeedbackState(value: string | string[] | undefined): FeedbackStateId {
  const id = Array.isArray(value) ? value[0] : value;
  return FEEDBACK_STATES.find((state) => state.id === id)?.id ?? "open";
}

export interface FeedbackItem {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed";
  type: FeedbackTypeId | null;
  createdAt: string;
  comments: number;
  /** The message without the "Submitted from Jim …" footer. */
  excerpt: string;
  appVersion: string | null;
  submitter: { id: string; label: string } | null;
}

export type FeedbackResult =
  | { ok: true; items: FeedbackItem[] }
  | { ok: false; reason: "not_configured" | "unavailable" };

interface GitHubIssue {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  created_at: string;
  comments: number;
  body: string | null;
  labels: ({ name?: string } | string)[];
  pull_request?: unknown;
}

export const FEEDBACK_PAGE_SIZE = 50;
/** A slow GitHub must not hold up an admin page. */
const GITHUB_TIMEOUT_MS = 5000;

function feedbackConfig(): { repo: string; token: string } | null {
  const repo = process.env.GITHUB_FEEDBACK_REPO;
  const token = process.env.GITHUB_FEEDBACK_TOKEN;
  return repo && token ? { repo, token } : null;
}

function gitHubHeaders(token: string): Record<string, string> {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
  };
}

/** One GitHub issue as a Feedback row; `accounts` maps submitter tags to accounts. */
export function toFeedbackItem(
  issue: GitHubIssue,
  accounts: Map<string, { id: string; label: string }>,
): FeedbackItem {
  const labels = issue.labels.map((label) => (typeof label === "string" ? label : label.name));
  const body = issue.body ?? "";
  const footer = body.lastIndexOf("\n---\nSubmitted from Jim");
  const tag = parseSubmitterTag(body);
  return {
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    state: issue.state,
    type: FEEDBACK_TYPES.find((type) => labels.includes(type.id))?.id ?? null,
    createdAt: issue.created_at,
    comments: issue.comments,
    excerpt: (footer >= 0 ? body.slice(0, footer) : body).trim().slice(0, 280),
    appVersion: body.match(/Submitted from Jim v(\S+?) by user/)?.[1] ?? null,
    submitter: tag ? (accounts.get(tag) ?? null) : null,
  };
}

/** Every account by its submitter tag. Only called after requireAdmin(). */
async function accountsByTag(db: DbOrTx): Promise<Map<string, { id: string; label: string }>> {
  const rows = await db
    .select({ id: users.id, email: users.email, username: users.username })
    .from(users);
  return new Map(
    rows.map((row) => [submitterTag(row.id), { id: row.id, label: row.username ?? row.email }]),
  );
}

/**
 * The in-app feedback filed on GitHub (issue #810), newest first, read only.
 * Only called after requireAdmin().
 */
export async function loadFeedback(
  filters: { state: FeedbackStateId; type: FeedbackTypeId | null },
  db: DbOrTx,
  fetchImpl: typeof fetch = fetch,
): Promise<FeedbackResult> {
  const config = feedbackConfig();
  if (!config) return { ok: false, reason: "not_configured" };
  const params = new URLSearchParams({
    labels: filters.type ? `feedback,${filters.type}` : "feedback",
    state: filters.state,
    per_page: String(FEEDBACK_PAGE_SIZE),
    sort: "created",
    direction: "desc",
  });
  try {
    const response = await fetchImpl(
      `https://api.github.com/repos/${config.repo}/issues?${params}`,
      {
        headers: gitHubHeaders(config.token),

        signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
      },
    );
    if (!response.ok) return { ok: false, reason: "unavailable" };
    const issues = ((await response.json()) as GitHubIssue[]).filter(
      (issue) => !issue.pull_request,
    );
    const accounts = await accountsByTag(db);
    return { ok: true, items: issues.map((issue) => toFeedbackItem(issue, accounts)) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** Open feedback issues (up to 100), or null when GitHub can't be read. */
export async function countOpenFeedback(fetchImpl: typeof fetch = fetch): Promise<number | null> {
  const config = feedbackConfig();
  if (!config) return null;
  try {
    const response = await fetchImpl(
      `https://api.github.com/repos/${config.repo}/issues?labels=feedback&state=open&per_page=100`,
      {
        headers: gitHubHeaders(config.token),

        signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
      },
    );
    if (!response.ok) return null;
    const issues = (await response.json()) as GitHubIssue[];
    return issues.filter((issue) => !issue.pull_request).length;
  } catch {
    return null;
  }
}

/** Whether the feedback token can read its repository, for Health. */
export async function checkFeedbackToken(
  fetchImpl: typeof fetch = fetch,
): Promise<"ok" | "failing" | "not_configured"> {
  const config = feedbackConfig();
  if (!config) return "not_configured";
  try {
    const response = await fetchImpl(`https://api.github.com/repos/${config.repo}`, {
      headers: gitHubHeaders(config.token),

      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
    return response.ok ? "ok" : "failing";
  } catch {
    return "failing";
  }
}
