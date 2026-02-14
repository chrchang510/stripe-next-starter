import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  ProductionPlan,
  DAG,
  DAGNode,
  DAGEdge,
  DAGDepth,
} from "../types";
import { addLog } from "../store";
import { collectResult, parseAgentResult } from "./utils";

const PRODUCTION_SYSTEM_PROMPT = `You are a production orchestration agent. Given a production plan, you create a Directed Acyclic Graph (DAG) of tasks for parallel code generation.

The DAG structure works as follows:
- Depth 0: Independent code generation tasks (one per module with no dependencies)
- Depth 1+: Code generation tasks that depend on depth 0 outputs, OR merge tasks that combine outputs from the previous depth
- Final depth: A single merge node that combines everything
- Last node: A review node that does final verification

For each code generation node, specify:
- The module name and description
- The files to generate
- The test files to generate
- Dependencies on other modules

For each merge node, specify:
- Which source nodes to merge
- What the merged output should look like
- Expected files after merging

Output MUST be valid JSON with this schema:
{
  "nodes": [
    {
      "id": "unique-id",
      "type": "codegen|merge|review",
      "label": "Short label",
      "description": "What this node does",
      "depth": 0,
      "input": { ... }
    }
  ],
  "edges": [
    { "from": "source-id", "to": "target-id" }
  ]
}

For codegen input: { "type": "codegen", "moduleName": "...", "description": "...", "files": [...], "tests": [...], "dependencies": [...], "planContext": "..." }
For merge input: { "type": "merge", "sourceNodeIds": [...], "mergeDescription": "...", "expectedFiles": [...] }
For review input: { "type": "review", "sourceNodeId": "final-merge-id", "fullPlan": "..." }`;

export async function runProductionAgent(
  projectId: string,
  plan: ProductionPlan
): Promise<DAG> {
  addLog(projectId, {
    level: "info",
    agent: "production",
    message: "Creating DAG from production plan...",
  });

  const prompt = `Create a DAG of parallelizable tasks for this production plan:

${JSON.stringify(plan, null, 2)}

Create code generation nodes for each module at the appropriate depth based on dependencies. Then create merge nodes to combine the outputs. Finally, add a review node.

Return ONLY valid JSON. No markdown, no code fences.`;

  const conversation = query({
    prompt,
    options: {
      model: "claude-opus-4-6",
      systemPrompt: PRODUCTION_SYSTEM_PROMPT,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: 5,
      outputFormat: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            nodes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  type: { type: "string", enum: ["codegen", "merge", "review"] },
                  label: { type: "string" },
                  description: { type: "string" },
                  depth: { type: "number" },
                  input: { type: "object" },
                },
                required: ["id", "type", "label", "description", "depth", "input"],
              },
            },
            edges: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: { type: "string" },
                  to: { type: "string" },
                },
                required: ["from", "to"],
              },
            },
          },
          required: ["nodes", "edges"],
        },
      },
    },
  });

  const resultText = await collectResult(conversation);
  const rawDAG = parseAgentResult<{ nodes: DAGNode[]; edges: DAGEdge[] }>(resultText, "production");

  // Build depth map
  const depthMap = new Map<number, string[]>();
  for (const node of rawDAG.nodes) {
    node.status = "pending";
    const depth = node.depth;
    if (!depthMap.has(depth)) depthMap.set(depth, []);
    depthMap.get(depth)!.push(node.id);
  }

  const depths: DAGDepth[] = Array.from(depthMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([depth, nodeIds]) => ({ depth, nodeIds }));

  const dag: DAG = {
    nodes: rawDAG.nodes,
    edges: rawDAG.edges,
    depths,
  };

  addLog(projectId, {
    level: "success",
    agent: "production",
    message: `DAG created: ${dag.nodes.length} nodes across ${dag.depths.length} depth levels`,
  });

  return dag;
}
