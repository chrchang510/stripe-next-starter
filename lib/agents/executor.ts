import { mkdirSync } from "fs";
import { join } from "path";
import {
  DAG,
  DAGNode,
  NodeOutput,
  CodeGenInput,
  MergeInput,
  ReviewInput,
  ProductionPlan,
} from "../types";
import { addLog, updateNode, setGeneratedFiles, updateProject } from "../store";
import { runCodeGenAgent } from "./codegen";
import { runMergerAgent } from "./merger";
import { runReviewerAgent } from "./reviewer";

const WORKSPACE_ROOT = join(process.cwd(), "workspace");

export async function executeDAG(
  projectId: string,
  dag: DAG,
  plan: ProductionPlan
): Promise<void> {
  const nodeOutputs = new Map<string, NodeOutput>();
  const failedNodes = new Set<string>();
  const workspaceBase = join(WORKSPACE_ROOT, projectId);

  // Create workspace directories
  mkdirSync(workspaceBase, { recursive: true });

  // Build a lookup of edges so we can check dependencies
  const incomingEdges = new Map<string, string[]>();
  for (const edge of dag.edges) {
    if (!incomingEdges.has(edge.to)) incomingEdges.set(edge.to, []);
    incomingEdges.get(edge.to)!.push(edge.from);
  }

  addLog(projectId, {
    level: "info",
    agent: "executor",
    message: `Starting DAG execution: ${dag.depths.length} depth levels, ${dag.nodes.length} total nodes`,
  });

  // Execute depth by depth
  for (const depth of dag.depths) {
    addLog(projectId, {
      level: "info",
      agent: "executor",
      message: `Executing depth ${depth.depth}: ${depth.nodeIds.length} parallel tasks`,
    });

    // Update project status based on what's running at this depth
    const nodesAtDepth = depth.nodeIds
      .map((id) => dag.nodes.find((n) => n.id === id))
      .filter(Boolean) as DAGNode[];
    const hasMerge = nodesAtDepth.some((n) => n.type === "merge");
    const hasReview = nodesAtDepth.some((n) => n.type === "review");
    if (hasReview) {
      updateProject(projectId, { status: "reviewing" });
    } else if (hasMerge) {
      updateProject(projectId, { status: "merging" });
    }

    // Execute all nodes at this depth in parallel
    const promises = depth.nodeIds.map(async (nodeId) => {
      const node = dag.nodes.find((n) => n.id === nodeId);
      if (!node) {
        addLog(projectId, {
          level: "error",
          agent: "executor",
          nodeId,
          message: `Node ${nodeId} not found in DAG`,
        });
        failedNodes.add(nodeId);
        return;
      }

      // Check if any dependency has failed
      const deps = incomingEdges.get(nodeId) || [];
      const failedDeps = deps.filter((d) => failedNodes.has(d));
      if (failedDeps.length > 0) {
        addLog(projectId, {
          level: "error",
          agent: "executor",
          nodeId,
          message: `Skipping ${node.label}: dependencies failed (${failedDeps.join(", ")})`,
        });
        updateNode(projectId, nodeId, { status: "error" });
        failedNodes.add(nodeId);
        return;
      }

      // Mark node as running
      updateNode(projectId, nodeId, { status: "running" });

      try {
        // Sanitize nodeId for filesystem path (replace non-alphanumeric chars)
        const safeNodeId = nodeId.replace(/[^a-zA-Z0-9_-]/g, "_");
        const nodePath = join(workspaceBase, `node-${safeNodeId}`);
        mkdirSync(nodePath, { recursive: true });

        let output: NodeOutput;

        switch (node.type) {
          case "codegen": {
            const input = node.input as CodeGenInput;
            output = await runCodeGenAgent(projectId, nodeId, input, nodePath);
            break;
          }
          case "merge": {
            const input = node.input as MergeInput;
            output = await runMergerAgent(
              projectId,
              nodeId,
              input,
              nodeOutputs,
              nodePath
            );
            break;
          }
          case "review": {
            const input = node.input as ReviewInput;
            // Get the source node output
            const sourceOutput = nodeOutputs.get(input.sourceNodeId);
            if (!sourceOutput) {
              throw new Error(`Source node ${input.sourceNodeId} has no output`);
            }
            output = await runReviewerAgent(
              projectId,
              nodeId,
              { ...input, fullPlan: JSON.stringify(plan) },
              sourceOutput,
              nodePath
            );
            break;
          }
          default:
            throw new Error(`Unknown node type: ${node.type}`);
        }

        nodeOutputs.set(nodeId, output);
        updateNode(projectId, nodeId, { status: "success", output });

        addLog(projectId, {
          level: "success",
          agent: "executor",
          nodeId,
          message: `Node ${node.label} completed successfully`,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        updateNode(projectId, nodeId, { status: "error" });
        failedNodes.add(nodeId);
        addLog(projectId, {
          level: "error",
          agent: "executor",
          nodeId,
          message: `Node ${node.label} failed: ${errorMessage}`,
        });
      }
    });

    // Wait for all nodes at this depth to complete
    await Promise.all(promises);
  }

  // Find the review node (most robust) or fall back to last node in last depth
  const reviewNode = dag.nodes.find((n) => n.type === "review");
  const finalNodeId = reviewNode
    ? reviewNode.id
    : dag.depths[dag.depths.length - 1]?.nodeIds[
        dag.depths[dag.depths.length - 1].nodeIds.length - 1
      ];
  const finalOutput = finalNodeId ? nodeOutputs.get(finalNodeId) : undefined;

  if (finalOutput) {
    setGeneratedFiles(projectId, finalOutput.files);
    updateProject(projectId, { status: "complete" });
    addLog(projectId, {
      level: "success",
      agent: "executor",
      message: `Pipeline complete! ${finalOutput.files.length} files generated.`,
    });
  } else {
    updateProject(projectId, {
      status: "error",
      error: `No output from final node. ${failedNodes.size} node(s) failed.`,
    });
    addLog(projectId, {
      level: "error",
      agent: "executor",
      message: `Pipeline failed: ${failedNodes.size} node(s) failed, no final output`,
    });
  }
}
