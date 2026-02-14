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
  const workspaceBase = join(WORKSPACE_ROOT, projectId);

  // Create workspace directories
  mkdirSync(workspaceBase, { recursive: true });

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
        return;
      }

      // Mark node as running
      updateNode(projectId, nodeId, { status: "running" });

      try {
        const nodePath = join(workspaceBase, `node-${nodeId}`);
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

  // Collect final output from the last node (should be review node)
  const lastDepth = dag.depths[dag.depths.length - 1];
  const lastNodeId = lastDepth.nodeIds[lastDepth.nodeIds.length - 1];
  const finalOutput = nodeOutputs.get(lastNodeId);

  if (finalOutput) {
    setGeneratedFiles(projectId, finalOutput.files);
    updateProject(projectId, { status: "complete" });
    addLog(projectId, {
      level: "success",
      agent: "executor",
      message: `Pipeline complete! ${finalOutput.files.length} files generated.`,
    });
  } else {
    updateProject(projectId, { status: "error", error: "No output from final node" });
    addLog(projectId, {
      level: "error",
      agent: "executor",
      message: "Pipeline failed: no output from final review node",
    });
  }
}
