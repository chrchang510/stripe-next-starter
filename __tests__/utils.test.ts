import { describe, it, expect } from "vitest";
import { collectResult, parseAgentResult } from "@/lib/agents/utils";

// Helper to create a mock async generator from an array of messages
async function* mockConversation(messages: unknown[]): AsyncGenerator<unknown, void> {
  for (const msg of messages) {
    yield msg;
  }
}

describe("collectResult", () => {
  it("returns result text on success", async () => {
    const conv = mockConversation([
      { type: "assistant", message: { content: [] } },
      {
        type: "result",
        subtype: "success",
        result: '{"key":"value"}',
        duration_ms: 100,
      },
    ]);

    const result = await collectResult(conv as ReturnType<typeof mockConversation> as any);
    expect(result).toBe('{"key":"value"}');
  });

  it("throws on error_max_turns", async () => {
    const conv = mockConversation([
      {
        type: "result",
        subtype: "error_max_turns",
        errors: ["Reached max turns"],
      },
    ]);

    await expect(collectResult(conv as any)).rejects.toThrow(
      "Agent ended with error_max_turns: Reached max turns"
    );
  });

  it("throws on error_during_execution", async () => {
    const conv = mockConversation([
      {
        type: "result",
        subtype: "error_during_execution",
        errors: ["Something broke", "Another error"],
      },
    ]);

    await expect(collectResult(conv as any)).rejects.toThrow(
      "Agent ended with error_during_execution: Something broke; Another error"
    );
  });

  it("throws on error_max_budget_usd", async () => {
    const conv = mockConversation([
      {
        type: "result",
        subtype: "error_max_budget_usd",
        errors: [],
      },
    ]);

    await expect(collectResult(conv as any)).rejects.toThrow(
      "Agent ended with error_max_budget_usd: unknown error"
    );
  });

  it("throws when no result is produced", async () => {
    const conv = mockConversation([
      { type: "assistant", message: { content: [] } },
      { type: "system", subtype: "init" },
    ]);

    await expect(collectResult(conv as any)).rejects.toThrow(
      "Agent produced no result output"
    );
  });

  it("throws when conversation is empty", async () => {
    const conv = mockConversation([]);
    await expect(collectResult(conv as any)).rejects.toThrow(
      "Agent produced no result output"
    );
  });

  it("ignores non-result messages", async () => {
    const conv = mockConversation([
      { type: "assistant", message: { content: [] } },
      { type: "system", subtype: "status" },
      { type: "tool_progress", data: {} },
      {
        type: "result",
        subtype: "success",
        result: "hello",
      },
    ]);

    const result = await collectResult(conv as any);
    expect(result).toBe("hello");
  });
});

describe("parseAgentResult", () => {
  it("parses valid JSON", () => {
    const result = parseAgentResult<{ key: string }>(
      '{"key":"value"}',
      "test-agent"
    );
    expect(result).toEqual({ key: "value" });
  });

  it("parses arrays", () => {
    const result = parseAgentResult<number[]>("[1,2,3]", "test-agent");
    expect(result).toEqual([1, 2, 3]);
  });

  it("throws on invalid JSON with agent name", () => {
    expect(() => parseAgentResult("not json", "planner")).toThrow(
      "planner returned invalid JSON: not json"
    );
  });

  it("throws on empty string with agent name", () => {
    expect(() => parseAgentResult("", "codegen")).toThrow(
      "codegen returned invalid JSON: "
    );
  });

  it("truncates long invalid JSON in error message", () => {
    const longString = "x".repeat(300);
    expect(() => parseAgentResult(longString, "merger")).toThrow(
      `merger returned invalid JSON: ${"x".repeat(200)}`
    );
  });
});
