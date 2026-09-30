"use client";

import { claudeCodeAddCommand, mcpEndpointUrl } from "@/lib/mcp/connect";
import { AccessTokensSection } from "./access-tokens-section";
import { CopyField } from "./copy-field";

/** Settings → Connect Claude: the official MCP server's URL, ready to paste into a client. */
export function ConnectClaudeSection() {
  const endpoint = mcpEndpointUrl();
  if (!endpoint) return null;

  return (
    <div className="flex w-full flex-col gap-3 text-left">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        Connect Claude
      </h2>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Let Claude read your training history and write routines. Add Jim as a custom connector with
        this URL, then sign in with this account's email when prompted.
      </p>
      <CopyField label="Server URL" value={endpoint} />
      <CopyField label="Claude Code" value={claudeCodeAddCommand(endpoint)} />
      <AccessTokensSection endpoint={endpoint} />
    </div>
  );
}
