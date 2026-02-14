import { describe, it, expect, beforeEach, vi } from "vitest";

// We need to isolate the store module between tests since it uses module-level Maps
let store: typeof import("@/lib/store");

beforeEach(async () => {
  // Re-import the module fresh for each test to reset internal state
  vi.resetModules();
  store = await import("@/lib/store");
});

describe("createProject", () => {
  it("creates a project with correct initial state", () => {
    const project = store.createProject("test-1", "Build a website");

    expect(project.id).toBe("test-1");
    expect(project.prompt).toBe("Build a website");
    expect(project.status).toBe("pending");
    expect(project.generatedFiles).toEqual([]);
    expect(project.logs).toEqual([]);
    expect(project.githubUrl).toBeUndefined();
    expect(project.createdAt).toBeGreaterThan(0);
    expect(project.updatedAt).toBeGreaterThan(0);
  });

  it("creates a project with optional githubUrl", () => {
    const project = store.createProject(
      "test-2",
      "Build a website",
      "https://github.com/user/repo"
    );

    expect(project.githubUrl).toBe("https://github.com/user/repo");
  });
});

describe("getProject", () => {
  it("returns undefined for non-existent project", () => {
    expect(store.getProject("nonexistent")).toBeUndefined();
  });

  it("returns the created project", () => {
    store.createProject("test-1", "prompt");
    const project = store.getProject("test-1");
    expect(project).toBeDefined();
    expect(project!.id).toBe("test-1");
  });
});

describe("updateProject", () => {
  it("updates project fields", () => {
    store.createProject("test-1", "prompt");
    const updated = store.updateProject("test-1", { status: "planning" });

    expect(updated).toBeDefined();
    expect(updated!.status).toBe("planning");
  });

  it("updates updatedAt timestamp", () => {
    const project = store.createProject("test-1", "prompt");
    const originalUpdatedAt = project.updatedAt;

    // Small delay to ensure timestamp changes
    const updated = store.updateProject("test-1", { status: "planning" });
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
  });

  it("returns undefined for non-existent project", () => {
    expect(store.updateProject("nonexistent", { status: "error" })).toBeUndefined();
  });

  it("emits update event", () => {
    store.createProject("test-1", "prompt");
    const events: Array<{ event: string; data: unknown }> = [];
    store.subscribe("test-1", (event, data) => events.push({ event, data }));

    store.updateProject("test-1", { status: "planning" });

    expect(events.length).toBe(1);
    expect(events[0].event).toBe("update");
  });
});

describe("addLog", () => {
  it("adds a log entry with timestamp", () => {
    store.createProject("test-1", "prompt");
    store.addLog("test-1", { level: "info", agent: "planner", message: "Starting" });

    const project = store.getProject("test-1")!;
    expect(project.logs.length).toBe(1);
    expect(project.logs[0].level).toBe("info");
    expect(project.logs[0].agent).toBe("planner");
    expect(project.logs[0].message).toBe("Starting");
    expect(project.logs[0].timestamp).toBeGreaterThan(0);
  });

  it("supports optional nodeId", () => {
    store.createProject("test-1", "prompt");
    store.addLog("test-1", {
      level: "info",
      agent: "codegen",
      nodeId: "node-1",
      message: "Generating",
    });

    const project = store.getProject("test-1")!;
    expect(project.logs[0].nodeId).toBe("node-1");
  });

  it("emits log event", () => {
    store.createProject("test-1", "prompt");
    const events: Array<{ event: string; data: unknown }> = [];
    store.subscribe("test-1", (event, data) => events.push({ event, data }));

    store.addLog("test-1", { level: "info", agent: "planner", message: "hi" });

    expect(events.some((e) => e.event === "log")).toBe(true);
  });

  it("does nothing for non-existent project", () => {
    // Should not throw
    store.addLog("nonexistent", { level: "info", agent: "planner", message: "hi" });
  });
});

describe("setPlan", () => {
  it("sets plan and updates status to building_dag", () => {
    store.createProject("test-1", "prompt");
    const plan = {
      summary: "test",
      architecture: "monolith",
      techStack: ["typescript"],
      modules: [],
      testStrategy: "vitest",
    };

    store.setPlan("test-1", plan);

    const project = store.getProject("test-1")!;
    expect(project.plan).toEqual(plan);
    expect(project.status).toBe("building_dag");
  });

  it("emits both update and plan events", () => {
    store.createProject("test-1", "prompt");
    const events: string[] = [];
    store.subscribe("test-1", (event) => events.push(event));

    store.setPlan("test-1", {
      summary: "test",
      architecture: "mono",
      techStack: [],
      modules: [],
      testStrategy: "none",
    });

    expect(events).toContain("update");
    expect(events).toContain("plan");
  });
});

describe("setDAG", () => {
  it("sets DAG and updates status to generating", () => {
    store.createProject("test-1", "prompt");
    const dag = { nodes: [], edges: [], depths: [] };

    store.setDAG("test-1", dag);

    const project = store.getProject("test-1")!;
    expect(project.dag).toEqual(dag);
    expect(project.status).toBe("generating");
  });

  it("emits both update and dag events", () => {
    store.createProject("test-1", "prompt");
    const events: string[] = [];
    store.subscribe("test-1", (event) => events.push(event));

    store.setDAG("test-1", { nodes: [], edges: [], depths: [] });

    expect(events).toContain("update");
    expect(events).toContain("dag");
  });
});

describe("updateNode", () => {
  it("updates a node within the DAG", () => {
    store.createProject("test-1", "prompt");
    store.setDAG("test-1", {
      nodes: [
        {
          id: "node-1",
          type: "codegen",
          label: "Module A",
          description: "Generate module A",
          status: "pending",
          depth: 0,
          input: {
            type: "codegen",
            moduleName: "A",
            description: "A",
            files: [],
            tests: [],
            dependencies: [],
            planContext: "",
          },
        },
      ],
      edges: [],
      depths: [{ depth: 0, nodeIds: ["node-1"] }],
    });

    store.updateNode("test-1", "node-1", { status: "running" });

    const project = store.getProject("test-1")!;
    expect(project.dag!.nodes[0].status).toBe("running");
  });

  it("emits node event with nodeId", () => {
    store.createProject("test-1", "prompt");
    store.setDAG("test-1", {
      nodes: [
        {
          id: "n-1",
          type: "codegen",
          label: "X",
          description: "X",
          status: "pending",
          depth: 0,
          input: {
            type: "codegen",
            moduleName: "X",
            description: "X",
            files: [],
            tests: [],
            dependencies: [],
            planContext: "",
          },
        },
      ],
      edges: [],
      depths: [{ depth: 0, nodeIds: ["n-1"] }],
    });

    const events: Array<{ event: string; data: unknown }> = [];
    store.subscribe("test-1", (event, data) => events.push({ event, data }));

    store.updateNode("test-1", "n-1", { status: "success" });

    const nodeEvent = events.find((e) => e.event === "node");
    expect(nodeEvent).toBeDefined();
    expect((nodeEvent!.data as any).nodeId).toBe("n-1");
    expect((nodeEvent!.data as any).status).toBe("success");
  });

  it("does nothing for non-existent node", () => {
    store.createProject("test-1", "prompt");
    store.setDAG("test-1", { nodes: [], edges: [], depths: [] });

    // Should not throw
    store.updateNode("test-1", "nonexistent", { status: "running" });
  });
});

describe("setGeneratedFiles", () => {
  it("sets generated files and emits events", () => {
    store.createProject("test-1", "prompt");
    const files = [{ path: "index.ts", content: "// hello", language: "typescript" }];

    const events: string[] = [];
    store.subscribe("test-1", (event) => events.push(event));

    store.setGeneratedFiles("test-1", files);

    const project = store.getProject("test-1")!;
    expect(project.generatedFiles).toEqual(files);
    expect(events).toContain("update");
    expect(events).toContain("files");
  });
});

describe("subscribe / unsubscribe", () => {
  it("receives events after subscribing", () => {
    store.createProject("test-1", "prompt");
    const events: string[] = [];
    store.subscribe("test-1", (event) => events.push(event));

    store.updateProject("test-1", { status: "planning" });
    expect(events.length).toBe(1);
  });

  it("stops receiving events after unsubscribing", () => {
    store.createProject("test-1", "prompt");
    const events: string[] = [];
    const unsubscribe = store.subscribe("test-1", (event) => events.push(event));

    store.updateProject("test-1", { status: "planning" });
    expect(events.length).toBe(1);

    unsubscribe();
    store.updateProject("test-1", { status: "generating" });
    expect(events.length).toBe(1); // No new events
  });

  it("multiple subscribers receive events independently", () => {
    store.createProject("test-1", "prompt");
    const events1: string[] = [];
    const events2: string[] = [];
    store.subscribe("test-1", (event) => events1.push(event));
    store.subscribe("test-1", (event) => events2.push(event));

    store.updateProject("test-1", { status: "planning" });
    expect(events1.length).toBe(1);
    expect(events2.length).toBe(1);
  });

  it("subscribing to non-existent project creates listener set", () => {
    const events: string[] = [];
    // Subscribe before project exists
    store.subscribe("future-project", (event) => events.push(event));

    store.createProject("future-project", "prompt");
    // Events won't fire from createProject, but subscribe should not throw
    expect(events.length).toBe(0);
  });
});
