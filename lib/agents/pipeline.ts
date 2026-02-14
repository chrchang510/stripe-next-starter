import { addLog, setPlan, setDAG, updateProject } from "../store";
import { runPlannerAgent } from "./planner";
import { runProductionAgent } from "./production";
import { executeDAG } from "./executor";

export async function runPipeline(
  projectId: string,
  prompt: string,
  githubUrl?: string
): Promise<void> {
  try {
    // Phase 1: Planning
    updateProject(projectId, { status: "planning" });
    addLog(projectId, {
      level: "info",
      agent: "pipeline",
      message: "Phase 1: Planning",
    });

    const plan = await runPlannerAgent(projectId, prompt, githubUrl);
    setPlan(projectId, plan);

    // Phase 2: DAG Creation
    updateProject(projectId, { status: "building_dag" });
    addLog(projectId, {
      level: "info",
      agent: "pipeline",
      message: "Phase 2: Building task DAG",
    });

    const dag = await runProductionAgent(projectId, plan);
    setDAG(projectId, dag);

    // Phase 3: Execute DAG (codegen, merge, review)
    updateProject(projectId, { status: "generating" });
    addLog(projectId, {
      level: "info",
      agent: "pipeline",
      message: "Phase 3: Executing DAG (code generation, merging, review)",
    });

    await executeDAG(projectId, dag, plan);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    updateProject(projectId, { status: "error", error: errorMessage });
    addLog(projectId, {
      level: "error",
      agent: "pipeline",
      message: `Pipeline failed: ${errorMessage}`,
    });
  }
}
