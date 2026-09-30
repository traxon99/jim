import { describe, expect, it } from "vitest";
import { claudeCodeAddCommand, claudeCodeAddCommandWithToken, mcpEndpointUrl } from "../connect";

describe("mcpEndpointUrl", () => {
  it("appends /mcp to a bare origin", () => {
    expect(mcpEndpointUrl("https://mcp.example.com")).toBe("https://mcp.example.com/mcp");
    expect(mcpEndpointUrl("https://mcp.example.com/")).toBe("https://mcp.example.com/mcp");
  });

  it("leaves an existing /mcp path alone", () => {
    expect(mcpEndpointUrl("https://mcp.example.com/mcp")).toBe("https://mcp.example.com/mcp");
    expect(mcpEndpointUrl("https://mcp.example.com/mcp/")).toBe("https://mcp.example.com/mcp");
  });

  it("keeps a path prefix", () => {
    expect(mcpEndpointUrl("https://example.com/jim")).toBe("https://example.com/jim/mcp");
  });

  it("drops query and hash, and trims whitespace", () => {
    expect(mcpEndpointUrl("  https://mcp.example.com/?x=1#y ")).toBe("https://mcp.example.com/mcp");
  });

  it("returns null when unset or not an http(s) URL", () => {
    expect(mcpEndpointUrl("")).toBeNull();
    expect(mcpEndpointUrl("   ")).toBeNull();
    expect(mcpEndpointUrl("mcp.example.com")).toBeNull();
    expect(mcpEndpointUrl("ftp://mcp.example.com")).toBeNull();
  });
});

describe("claudeCodeAddCommand", () => {
  it("builds the Claude Code add command", () => {
    expect(claudeCodeAddCommand("https://mcp.example.com/mcp")).toBe(
      "claude mcp add --transport http jim https://mcp.example.com/mcp",
    );
  });
});

describe("claudeCodeAddCommandWithToken", () => {
  it("passes the token as a bearer header", () => {
    expect(claudeCodeAddCommandWithToken("https://mcp.example.com/mcp", "jim_pat_x")).toBe(
      'claude mcp add --transport http jim https://mcp.example.com/mcp --header "Authorization: Bearer jim_pat_x"',
    );
  });
});
