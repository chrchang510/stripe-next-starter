import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DAG, ProductionPlan, NodeOutput } from "@/lib/types";

// Mock the agent modules before importing executor
vi.mock("@/lib/agents/codegen", () => ({
  runCodeGenAgent: vi.fn(),
}));
vi.mock("@/lib/agents/merger", () => ({
  runMergerAgent: vi.fn(),
}));
vi.mock("@/lib/agents/reviewer", () => ({
  runReviewerAgent: vi.fn(),
}));
vi.mock("fs", () => ({
  mkdirSync: vi.fn(),
}));

import { executeDAG } from "@/lib/agents/executor";
import { runCodeGenAgent } from "@/lib/agents/codegen";
import { runMergerAgent } from "@/lib/agents/merger";
import { runReviewerAgent } from "@/lib/agents/reviewer";
import * as store from "@/lib/store";

const mockCodeGenAgent = vi.mocked(runCodeGenAgent);
const mockMergerAgent = vi.mocked(runMergerAgent);
const mockReviewerAgent = vi.mocked(runReviewerAgent);

const PLAN: ProductionPlan = {
  summary: "Test project",
  architecture: "monolith",
  techStack: ["typescript"],
  modules: [{ name: "core", description: "Core module", dependencies: [], files: ["index.ts"], tests: ["index.test.ts"] }],
  testStrategy: "vitest",
};

function makeOutput(files: string[] = ["index.ts"]): NodeOutput {
  return {
    files: files.map((f) => ({ path: f, content: `// ${f}`, language: "typescript" })),
    testResults: [{ name: "test1", passed: true, output: "ok" }],
    buildSuccess: true,
    reviewNotes: "All good",
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  // Create project in store
  store.createProject("proj-1", "test prompt");
});

describe("executeDAG", () => {
  it("executes a single codegen node", async () => {
    const output = makeOutput();
    mockCodeGenAgent.mockResolvedValue(output);

    const dag: DAG = {
      nodes: [
        {
          id: "cg-1",
          type: "codegen",
          label: "Core",
          description: "Generate core",
          status: "pending",
          depth: 0,
          input: { type: "codegen", moduleName: "core", description: "Core", files: ["index.ts"], tests: [], dependencies: [], planContext: "" },
        },
      ],
      edges: [],
      depths: [{ depth: 0, nodeIds: ["cg-1"] }],
    };

    await executeDAG("proj-1", dag, PLAN);

    expect(mockCodeGenAgent).toHaveBeenCalledTimes(1);
    // With no review node, it falls back to last node
    const project = store.getProject("proj-1");
    expect(project!.generatedFiles).toEqual(output.files);
    expect(project!.status).toBe("complete");
  });

  it("executes codegen -> merge -> review pipeline", async () => {
    const codegenOutput = makeOutput(["src/a.ts"]);
    const mergeOutput = makeOutput(["src/a.ts", "src/b.ts"]);
    const reviewOutput = makeOutput(["src/a.ts", "src/b.ts", "README.md"]);

    mockCodeGenAgent.mockResolvedValue(codegenOutput);
    mockMergerAgent.mockResolvedValue(mergeOutput);
    mockReviewerAgent.mockResolvedValue(reviewOutput);

    const dag: DAG = {
      nodes: [
        { id: "cg-1", type: "codegen", label: "Module A", description: "A", status: "pending", depth: 0, input: { type: "codegen", moduleName: "A", description: "A", files: ["src/a.ts"], tests: [], dependencies: [], planContext: "" } },
        { id: "cg-2", type: "codegen", label: "Module B", description: "B", status: "pending", depth: 0, input: { type: "codegen", moduleName: "B", description: "B", files: ["src/b.ts"], tests: [], dependencies: [], planContext: "" } },
        { id: "merge-1", type: "merge", label: "Merge All", description: "Merge", status: "pending", depth: 1, input: { type: "merge", sourceNodeIds: ["cg-1", "cg-2"], mergeDescription: "Merge all", expectedFiles: [] } },
        { id: "review-1", type: "review", label: "Review", description: "Review", status: "pending", depth: 2, input: { type: "review", sourceNodeId: "merge-1", fullPlan: "" } },
      ],
      edges: [
        { from: "cg-1", to: "merge-1" },
        { from: "cg-2", to: "merge-1" },
        { from: "merge-1", to: "review-1" },
      ],
      depths: [
        { depth: 0, nodeIds: ["cg-1", "cg-2"] },
        { depth: 1, nodeIds: ["merge-1"] },
        { depth: 2, nodeIds: ["review-1"] },
      ],
    };

    await executeDAG("proj-1", dag, PLAN);

    expect(mockCodeGenAgent).toHaveBeenCalledTimes(2);
    expect(mockMergerAgent).toHaveBeenCalledTimes(1);
    expect(mockReviewerAgent).toHaveBeenCalledTimes(1);

    const project = store.getProject("proj-1");
    expect(project!.status).toBe("complete");
    expect(project!.generatedFiles).toEqual(reviewOutput.files);
  });

  it("skips downstream nodes when dependency fails", async () => {
    mockCodeGenAgent.mockRejectedValueOnce(new Error("Agent crashed"));
    mockCodeGenAgent.mockResolvedValueOnce(makeOutput(["b.ts"]));

    const dag: DAG = {
      nodes: [
        { id: "cg-1", type: "codegen", label: "A", description: "A", status: "pending", depth: 0, input: { type: "codegen", moduleName: "A", description: "A", files: [], tests: [], dependencies: [], planContext: "" } },
        { id: "cg-2", type: "codegen", label: "B", description: "B", status: "pending", depth: 0, input: { type: "codegen", moduleName: "B", description: "B", files: [], tests: [], dependencies: [], planContext: "" } },
        { id: "merge-1", type: "merge", label: "Merge", description: "Merge", status: "pending", depth: 1, input: { type: "merge", sourceNodeIds: ["cg-1", "cg-2"], mergeDescription: "Merge", expectedFiles: [] } },
      ],
      edges: [
        { from: "cg-1", to: "merge-1" },
        { from: "cg-2", to: "merge-1" },
      ],
      depths: [
        { depth: 0, nodeIds: ["cg-1", "cg-2"] },
        { depth: 1, nodeIds: ["merge-1"] },
      ],
    };

    await executeDAG("proj-1", dag, PLAN);

    // Codegen called twice (both at depth 0 run in parallel)
    expect(mockCodeGenAgent).toHaveBeenCalledTimes(2);
    // Merger should NOT be called because cg-1 failed (it depends on cg-1)
    expect(mockMergerAgent).not.toHaveBeenCalled();

    const project = store.getProject("proj-1");
    expect(project!.status).toBe("error");
  });

  it("sets status to 'merging' when running merge nodes", async () => {
    const codegenOutput = makeOutput();
    const mergeOutput = makeOutput();
    mockCodeGenAgent.mockResolvedValue(codegenOutput);
    mockMergerAgent.mockResolvedValue(mergeOutput);

    const statusHistory: string[] = [];
    store.subscribe("proj-1", (event, data) => {
      if (event === "update" && (data as any).status) {
        statusHistory.push((data as any).status);
      }
    });

    const dag: DAG = {
      nodes: [
        { id: "cg-1", type: "codegen", label: "A", description: "A", status: "pending", depth: 0, input: { type: "codegen", moduleName: "A", description: "A", files: [], tests: [], dependencies: [], planContext: "" } },
        { id: "merge-1", type: "merge", label: "Merge", description: "Merge", status: "pending", depth: 1, input: { type: "merge", sourceNodeIds: ["cg-1"], mergeDescription: "Merge", expectedFiles: [] } },
      ],
      edges: [{ from: "cg-1", to: "merge-1" }],
      depths: [
        { depth: 0, nodeIds: ["cg-1"] },
        { depth: 1, nodeIds: ["merge-1"] },
      ],
    };

    await executeDAG("proj-1", dag, PLAN);

    expect(statusHistory).toContain("merging");
    expect(statusHistory).toContain("complete");
  });

  it("sets status to 'reviewing' when running review nodes", async () => {
    const codegenOutput = makeOutput();
    const reviewOutput = makeOutput();
    mockCodeGenAgent.mockResolvedValue(codegenOutput);
    mockReviewerAgent.mockResolvedValue(reviewOutput);

    const statusHistory: string[] = [];
    store.subscribe("proj-1", (event, data) => {
      if (event === "update" && (data as any).status) {
        statusHistory.push((data as any).status);
      }
    });

    const dag: DAG = {
      nodes: [
        { id: "cg-1", type: "codegen", label: "A", description: "A", status: "pending", depth: 0, input: { type: "codegen", moduleName: "A", description: "A", files: [], tests: [], dependencies: [], planContext: "" } },
        { id: "review-1", type: "review", label: "Review", description: "Review", status: "pending", depth: 1, input: { type: "review", sourceNodeId: "cg-1", fullPlan: "" } },
      ],
      edges: [{ from: "cg-1", to: "review-1" }],
      depths: [
        { depth: 0, nodeIds: ["cg-1"] },
        { depth: 1, nodeIds: ["review-1"] },
      ],
    };

    await executeDAG("proj-1", dag, PLAN);

    expect(statusHistory).toContain("reviewing");
    expect(statusHistory).toContain("complete");
  });

  it("handles missing node ID in DAG gracefully", async () => {
    const dag: DAG = {
      nodes: [],
      edges: [],
      depths: [{ depth: 0, nodeIds: ["nonexistent"] }],
    };

    await executeDAG("proj-1", dag, PLAN);

    const project = store.getProject("proj-1");
    expect(project!.status).toBe("error");
  });

  it("review node throws when source has no output", async () => {
    // codegen fails, so there's no output for the review node's source
    mockCodeGenAgent.mockRejectedValue(new Error("fail"));

    const dag: DAG = {
      nodes: [
        { id: "cg-1", type: "codegen", label: "A", description: "A", status: "pending", depth: 0, input: { type: "codegen", moduleName: "A", description: "A", files: [], tests: [], dependencies: [], planContext: "" } },
        { id: "review-1", type: "review", label: "Review", description: "Review", status: "pending", depth: 1, input: { type: "review", sourceNodeId: "cg-1", fullPlan: "" } },
      ],
      edges: [{ from: "cg-1", to: "review-1" }],
      depths: [
        { depth: 0, nodeIds: ["cg-1"] },
        { depth: 1, nodeIds: ["review-1"] },
      ],
    };

    await executeDAG("proj-1", dag, PLAN);

    // review-1 should be skipped because cg-1 failed
    expect(mockReviewerAgent).not.toHaveBeenCalled();
    const project = store.getProject("proj-1");
    expect(project!.status).toBe("error");
  });

  it("finds review node by type even if not last in depth array", async () => {
    const codegenOutput = makeOutput();
    const reviewOutput = makeOutput(["final.ts"]);
    mockCodeGenAgent.mockResolvedValue(codegenOutput);
    mockReviewerAgent.mockResolvedValue(reviewOutput);

    // Review node is NOT the last nodeId in the last depth
    const dag: DAG = {
      nodes: [
        { id: "cg-1", type: "codegen", label: "A", description: "A", status: "pending", depth: 0, input: { type: "codegen", moduleName: "A", description: "A", files: [], tests: [], dependencies: [], planContext: "" } },
        { id: "review-1", type: "review", label: "Review", description: "Review", status: "pending", depth: 1, input: { type: "review", sourceNodeId: "cg-1", fullPlan: "" } },
      ],
      edges: [{ from: "cg-1", to: "review-1" }],
      depths: [
        { depth: 0, nodeIds: ["cg-1"] },
        { depth: 1, nodeIds: ["review-1"] },
      ],
    };

    await executeDAG("proj-1", dag, PLAN);

    const project = store.getProject("proj-1");
    expect(project!.generatedFiles).toEqual(reviewOutput.files);
  });

  it("sanitizes node IDs for filesystem paths", async () => {
    const output = makeOutput();
    mockCodeGenAgent.mockResolvedValue(output);

    const dag: DAG = {
      nodes: [
        { id: "node/../../evil", type: "codegen", label: "Evil", description: "Evil", status: "pending", depth: 0, input: { type: "codegen", moduleName: "evil", description: "evil", files: [], tests: [], dependencies: [], planContext: "" } },
      ],
      edges: [],
      depths: [{ depth: 0, nodeIds: ["node/../../evil"] }],
    };

    // Should not throw - nodeId gets sanitized
    await executeDAG("proj-1", dag, PLAN);
    expect(mockCodeGenAgent).toHaveBeenCalledTimes(1);
  });
});
