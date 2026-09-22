export async function submitFeedback(
  message: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; url?: string } | { ok: false; error: string }> {
  try {
    const response = await fetchImpl("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: body?.error ?? "Failed to send feedback" };
    }
    const payload = (await response.json()) as { url?: string };
    return { ok: true, url: payload.url };
  } catch {
    return { ok: false, error: "No connection — try again once you're back online" };
  }
}
