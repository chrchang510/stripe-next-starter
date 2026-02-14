import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductionPlan, DAG, NodeOutput } from "@/lib/types";

// Mock the agent modules
vi.mock("@/lib/agents/planner", () => ({
  runPlannerAgent: vi.fn(),
}));
vi.mock("@/lib/agents/production", () => ({
  runProductionAgent: vi.fn(),
}));
vi.mock("@/lib/agents/executor", () => ({
  executeDAG: vi.fn(),
}));

import { runPipeline } from "@/lib/agents/pipeline";
import { runPlannerAgent } from "@/lib/agents/planner";
import { runProductionAgent } from "@/lib/agents/production";
import { executeDAG } from "@/lib/agents/executor";
import * as store from "@/lib/store";

const mockPlanner = vi.mocked(runPlannerAgent);
const mockProduction = vi.mocked(runProductionAgent);
const mockExecuteDAG = vi.mocked(executeDAG);

const PLAN: ProductionPlan = {
  summary: "Test project",
  architecture: "monolith",
  techStack: ["typescript"],
  modules: [],
  testStrategy: "vitest",
};

const DAG_RESULT: DAG = {
  nodes: [],
  edges: [],
  depths: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  store.createProject("proj-1", "Build something");
});

describe("runPipeline", () => {
  it("executes all three phases in order", async () => {
    mockPlanner.mockResolvedValue(PLAN);
    mockProduction.mockResolvedValue(DAG_RESULT);
    mockExecuteDAG.mockResolvedValue(undefined);

    await runPipeline("proj-1", "Build something");

    // Verify call order
    expect(mockPlanner).toHaveBeenCalledWith("proj-1", "Build something", undefined);
    expect(mockProduction).toHaveBeenCalledWith("proj-1", PLAN);
    expect(mockExecuteDAG).toHaveBeenCalledWith("proj-1", DAG_RESULT, PLAN);

    // Verify order: planner before production, production before executor
    const plannerOrder = mockPlanner.mock.invocationCallOrder[0];
    const productionOrder = mockProduction.mock.invocationCallOrder[0];
    const executorOrder = mockExecuteDAG.mock.invocationCallOrder[0];
    expect(plannerOrder).toBeLessThan(productionOrder);
    expect(productionOrder).toBeLessThan(executorOrder);
  });

  it("passes githubUrl through to planner", async () => {
    mockPlanner.mockResolvedValue(PLAN);
    mockProduction.mockResolvedValue(DAG_RESULT);
    mockExecuteDAG.mockResolvedValue(undefined);

    await runPipeline("proj-1", "Build something", "https://github.com/user/repo");

    expect(mockPlanner).toHaveBeenCalledWith(
      "proj-1",
      "Build something",
      "https://github.com/user/repo"
    );
  });

  it("sets plan via store on successful planning", async () => {
    mockPlanner.mockResolvedValue(PLAN);
    mockProduction.mockResolvedValue(DAG_RESULT);
    mockExecuteDAG.mockResolvedValue(undefined);

    await runPipeline("proj-1", "Build something");

    const project = store.getProject("proj-1");
    expect(project!.plan).toEqual(PLAN);
  });

  it("sets DAG via store on successful production", async () => {
    mockPlanner.mockResolvedValue(PLAN);
    mockProduction.mockResolvedValue(DAG_RESULT);
    mockExecuteDAG.mockResolvedValue(undefined);

    await runPipeline("proj-1", "Build something");

    const project = store.getProject("proj-1");
    expect(project!.dag).toEqual(DAG_RESULT);
  });

  it("handles planner failure gracefully", async () => {
    mockPlanner.mockRejectedValue(new Error("Planner exploded"));

    await runPipeline("proj-1", "Build something");

    const project = store.getProject("proj-1");
    expect(project!.status).toBe("error");
    expect(project!.error).toBe("Planner exploded");
    expect(mockProduction).not.toHaveBeenCalled();
    expect(mockExecuteDAG).not.toHaveBeenCalled();
  });

  it("handles production failure gracefully", async () => {
    mockPlanner.mockResolvedValue(PLAN);
    mockProduction.mockRejectedValue(new Error("DAG creation failed"));

    await runPipeline("proj-1", "Build something");

    const project = store.getProject("proj-1");
    expect(project!.status).toBe("error");
    expect(project!.error).toBe("DAG creation failed");
    expect(mockExecuteDAG).not.toHaveBeenCalled();
  });

  it("handles executor failure gracefully", async () => {
    mockPlanner.mockResolvedValue(PLAN);
    mockProduction.mockResolvedValue(DAG_RESULT);
    mockExecuteDAG.mockRejectedValue(new Error("Execution failed"));

    await runPipeline("proj-1", "Build something");

    const project = store.getProject("proj-1");
    expect(project!.status).toBe("error");
    expect(project!.error).toBe("Execution failed");
  });

  it("sets status to planning at start", async () => {
    const statusHistory: string[] = [];
    store.subscribe("proj-1", (event, data) => {
      if (event === "update" && (data as any).status) {
        statusHistory.push((data as any).status);
      }
    });

    mockPlanner.mockResolvedValue(PLAN);
    mockProduction.mockResolvedValue(DAG_RESULT);
    mockExecuteDAG.mockResolvedValue(undefined);

    await runPipeline("proj-1", "Build something");

    expect(statusHistory[0]).toBe("planning");
  });

  it("handles non-Error throws", async () => {
    mockPlanner.mockRejectedValue("string error");

    await runPipeline("proj-1", "Build something");

    const project = store.getProject("proj-1");
    expect(project!.status).toBe("error");
    expect(project!.error).toBe("string error");
  });
});
