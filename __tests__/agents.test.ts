import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductionPlan, CodeGenInput, MergeInput, ReviewInput, NodeOutput } from "@/lib/types";

// Mock the SDK query function
const mockConversation = {
  [Symbol.asyncIterator]: vi.fn(),
};

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(() => mockConversation),
}));

// Mock the store
vi.mock("@/lib/store", () => ({
  addLog: vi.fn(),
  updateProject: vi.fn(),
  updateNode: vi.fn(),
  setPlan: vi.fn(),
  setDAG: vi.fn(),
  setGeneratedFiles: vi.fn(),
}));

import { query } from "@anthropic-ai/claude-agent-sdk";

const mockQuery = vi.mocked(query);

// Helper to make the mock conversation yield specific messages
function setConversationResult(result: string) {
  const messages = [
    { type: "result", subtype: "success", result },
  ];
  let index = 0;
  mockConversation[Symbol.asyncIterator].mockReturnValue({
    next: () => {
      if (index < messages.length) {
        return Promise.resolve({ value: messages[index++], done: false });
      }
      return Promise.resolve({ value: undefined, done: true });
    },
  });
}

function setConversationError(subtype: string, errors: string[]) {
  const messages = [
    { type: "result", subtype, errors },
  ];
  let index = 0;
  mockConversation[Symbol.asyncIterator].mockReturnValue({
    next: () => {
      if (index < messages.length) {
        return Promise.resolve({ value: messages[index++], done: false });
      }
      return Promise.resolve({ value: undefined, done: true });
    },
  });
}

function setConversationEmpty() {
  mockConversation[Symbol.asyncIterator].mockReturnValue({
    next: () => Promise.resolve({ value: undefined, done: true }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runPlannerAgent", () => {
  it("returns a parsed plan on success", async () => {
    const { runPlannerAgent } = await import("@/lib/agents/planner");

    const plan: ProductionPlan = {
      summary: "A todo app",
      architecture: "SPA",
      techStack: ["react", "typescript"],
      modules: [{ name: "core", description: "Core module", dependencies: [], files: ["index.ts"], tests: ["index.test.ts"] }],
      testStrategy: "jest",
    };
    setConversationResult(JSON.stringify(plan));

    const result = await runPlannerAgent("proj-1", "Build a todo app");
    expect(result).toEqual(plan);
  });

  it("passes githubUrl to prompt when provided", async () => {
    const { runPlannerAgent } = await import("@/lib/agents/planner");

    const plan: ProductionPlan = {
      summary: "test",
      architecture: "test",
      techStack: [],
      modules: [],
      testStrategy: "none",
    };
    setConversationResult(JSON.stringify(plan));

    await runPlannerAgent("proj-1", "Build something", "https://github.com/user/repo");

    // Verify query was called (the prompt contains the githubUrl)
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.prompt).toContain("https://github.com/user/repo");
  });

  it("throws on SDK error result", async () => {
    const { runPlannerAgent } = await import("@/lib/agents/planner");

    setConversationError("error_max_turns", ["Exceeded max turns"]);

    await expect(runPlannerAgent("proj-1", "Build a todo app")).rejects.toThrow(
      "Agent ended with error_max_turns"
    );
  });

  it("throws on empty result", async () => {
    const { runPlannerAgent } = await import("@/lib/agents/planner");

    setConversationEmpty();

    await expect(runPlannerAgent("proj-1", "Build a todo app")).rejects.toThrow(
      "Agent produced no result output"
    );
  });

  it("uses correct model and system prompt", async () => {
    const { runPlannerAgent } = await import("@/lib/agents/planner");

    setConversationResult(JSON.stringify({
      summary: "test", architecture: "test", techStack: [], modules: [], testStrategy: "none",
    }));

    await runPlannerAgent("proj-1", "Build something");

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options?.model).toBe("claude-opus-4-6");
    expect(callArgs.options?.systemPrompt).toContain("senior software architect");
    expect(callArgs.options?.maxTurns).toBe(15);
  });
});

describe("runProductionAgent", () => {
  it("returns a parsed DAG on success", async () => {
    const { runProductionAgent } = await import("@/lib/agents/production");

    const rawDAG = {
      nodes: [
        { id: "cg-1", type: "codegen", label: "Core", description: "Core module", depth: 0, input: { type: "codegen", moduleName: "core", description: "Core", files: [], tests: [], dependencies: [], planContext: "" } },
      ],
      edges: [],
    };
    setConversationResult(JSON.stringify(rawDAG));

    const plan: ProductionPlan = {
      summary: "test", architecture: "test", techStack: [], modules: [], testStrategy: "none",
    };
    const result = await runProductionAgent("proj-1", plan);

    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toEqual([]);
    expect(result.depths).toHaveLength(1);
    expect(result.depths[0].depth).toBe(0);
    expect(result.depths[0].nodeIds).toEqual(["cg-1"]);
    // Status should be initialized to "pending"
    expect(result.nodes[0].status).toBe("pending");
  });

  it("builds correct depth map from multi-depth DAG", async () => {
    const { runProductionAgent } = await import("@/lib/agents/production");

    const rawDAG = {
      nodes: [
        { id: "a", type: "codegen", label: "A", description: "A", depth: 0, input: {} },
        { id: "b", type: "codegen", label: "B", description: "B", depth: 0, input: {} },
        { id: "c", type: "merge", label: "C", description: "C", depth: 1, input: {} },
        { id: "d", type: "review", label: "D", description: "D", depth: 2, input: {} },
      ],
      edges: [{ from: "a", to: "c" }, { from: "b", to: "c" }, { from: "c", to: "d" }],
    };
    setConversationResult(JSON.stringify(rawDAG));

    const result = await runProductionAgent("proj-1", {
      summary: "test", architecture: "test", techStack: [], modules: [], testStrategy: "none",
    });

    expect(result.depths).toHaveLength(3);
    expect(result.depths[0]).toEqual({ depth: 0, nodeIds: ["a", "b"] });
    expect(result.depths[1]).toEqual({ depth: 1, nodeIds: ["c"] });
    expect(result.depths[2]).toEqual({ depth: 2, nodeIds: ["d"] });
  });

  it("throws on SDK error result", async () => {
    const { runProductionAgent } = await import("@/lib/agents/production");

    setConversationError("error_during_execution", ["Failed"]);

    await expect(
      runProductionAgent("proj-1", {
        summary: "test", architecture: "test", techStack: [], modules: [], testStrategy: "none",
      })
    ).rejects.toThrow("Agent ended with error_during_execution");
  });
});

describe("runCodeGenAgent", () => {
  it("returns parsed node output on success", async () => {
    const { runCodeGenAgent } = await import("@/lib/agents/codegen");

    const output: NodeOutput = {
      files: [{ path: "index.ts", content: "// code", language: "typescript" }],
      testResults: [{ name: "test1", passed: true, output: "ok" }],
      buildSuccess: true,
      reviewNotes: "All good",
    };
    setConversationResult(JSON.stringify(output));

    const input: CodeGenInput = {
      type: "codegen",
      moduleName: "core",
      description: "Core module",
      files: ["index.ts"],
      tests: ["index.test.ts"],
      dependencies: [],
      planContext: "Build core",
    };

    const result = await runCodeGenAgent("proj-1", "node-1", input, "/tmp/workspace");
    expect(result).toEqual(output);
  });

  it("includes workspace path in prompt and options", async () => {
    const { runCodeGenAgent } = await import("@/lib/agents/codegen");

    setConversationResult(JSON.stringify({
      files: [], testResults: [], buildSuccess: true,
    }));

    const input: CodeGenInput = {
      type: "codegen",
      moduleName: "core",
      description: "Core",
      files: [],
      tests: [],
      dependencies: [],
      planContext: "",
    };

    await runCodeGenAgent("proj-1", "node-1", input, "/my/workspace");

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.prompt).toContain("/my/workspace");
    expect(callArgs.options?.cwd).toBe("/my/workspace");
  });

  it("throws on SDK error", async () => {
    const { runCodeGenAgent } = await import("@/lib/agents/codegen");

    setConversationError("error_max_budget_usd", ["Budget exceeded"]);

    const input: CodeGenInput = {
      type: "codegen", moduleName: "core", description: "Core", files: [], tests: [], dependencies: [], planContext: "",
    };

    await expect(
      runCodeGenAgent("proj-1", "node-1", input, "/tmp/workspace")
    ).rejects.toThrow("Agent ended with error_max_budget_usd");
  });
});

describe("runMergerAgent", () => {
  it("returns merged output on success", async () => {
    const { runMergerAgent } = await import("@/lib/agents/merger");

    const mergedOutput: NodeOutput = {
      files: [
        { path: "a.ts", content: "// a", language: "typescript" },
        { path: "b.ts", content: "// b", language: "typescript" },
      ],
      testResults: [],
      buildSuccess: true,
      reviewNotes: "Merged",
    };
    setConversationResult(JSON.stringify(mergedOutput));

    const input: MergeInput = {
      type: "merge",
      sourceNodeIds: ["cg-1", "cg-2"],
      mergeDescription: "Merge A and B",
      expectedFiles: ["a.ts", "b.ts"],
    };

    const sourceOutputs = new Map<string, NodeOutput>();
    sourceOutputs.set("cg-1", {
      files: [{ path: "a.ts", content: "// a", language: "typescript" }],
      buildSuccess: true,
    });
    sourceOutputs.set("cg-2", {
      files: [{ path: "b.ts", content: "// b", language: "typescript" }],
      buildSuccess: true,
    });

    const result = await runMergerAgent("proj-1", "merge-1", input, sourceOutputs, "/tmp/workspace");
    expect(result).toEqual(mergedOutput);
  });

  it("includes source file contents in prompt", async () => {
    const { runMergerAgent } = await import("@/lib/agents/merger");

    setConversationResult(JSON.stringify({
      files: [], testResults: [], buildSuccess: true,
    }));

    const input: MergeInput = {
      type: "merge",
      sourceNodeIds: ["cg-1"],
      mergeDescription: "Merge",
      expectedFiles: [],
    };

    const sourceOutputs = new Map<string, NodeOutput>();
    sourceOutputs.set("cg-1", {
      files: [{ path: "index.ts", content: "export const x = 1;", language: "typescript" }],
      buildSuccess: true,
    });

    await runMergerAgent("proj-1", "merge-1", input, sourceOutputs, "/tmp/ws");

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.prompt).toContain("export const x = 1;");
  });
});

describe("runReviewerAgent", () => {
  it("returns reviewed output on success", async () => {
    const { runReviewerAgent } = await import("@/lib/agents/reviewer");

    const reviewedOutput: NodeOutput = {
      files: [{ path: "index.ts", content: "// reviewed", language: "typescript" }],
      testResults: [{ name: "e2e", passed: true, output: "ok" }],
      buildSuccess: true,
      reviewNotes: "All good, no issues found",
    };
    setConversationResult(JSON.stringify(reviewedOutput));

    const input: ReviewInput = {
      type: "review",
      sourceNodeId: "merge-1",
      fullPlan: '{"summary":"test"}',
    };

    const sourceOutput: NodeOutput = {
      files: [{ path: "index.ts", content: "// code", language: "typescript" }],
      buildSuccess: true,
    };

    const result = await runReviewerAgent("proj-1", "review-1", input, sourceOutput, "/tmp/ws");
    expect(result).toEqual(reviewedOutput);
  });

  it("includes full plan and source files in prompt", async () => {
    const { runReviewerAgent } = await import("@/lib/agents/reviewer");

    setConversationResult(JSON.stringify({
      files: [], testResults: [], buildSuccess: true,
    }));

    const input: ReviewInput = {
      type: "review",
      sourceNodeId: "merge-1",
      fullPlan: "This is the full plan",
    };

    const sourceOutput: NodeOutput = {
      files: [{ path: "app.ts", content: "console.log('hello')", language: "typescript" }],
      buildSuccess: true,
    };

    await runReviewerAgent("proj-1", "review-1", input, sourceOutput, "/tmp/ws");

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.prompt).toContain("This is the full plan");
    expect(callArgs.prompt).toContain("console.log('hello')");
  });

  it("uses highest maxTurns (40) for thorough review", async () => {
    const { runReviewerAgent } = await import("@/lib/agents/reviewer");

    setConversationResult(JSON.stringify({
      files: [], testResults: [], buildSuccess: true,
    }));

    await runReviewerAgent(
      "proj-1",
      "review-1",
      { type: "review", sourceNodeId: "m-1", fullPlan: "" },
      { files: [], buildSuccess: true },
      "/tmp/ws"
    );

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options?.maxTurns).toBe(40);
  });
});
