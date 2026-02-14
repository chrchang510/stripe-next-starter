import { Project, LogEntry, GeneratedFile, DAG, ProductionPlan, DAGNode } from "./types";

const projects = new Map<string, Project>();
const listeners = new Map<string, Set<(event: string, data: unknown) => void>>();

export function createProject(id: string, prompt: string, githubUrl?: string): Project {
  const project: Project = {
    id,
    prompt,
    githubUrl,
    status: "pending",
    generatedFiles: [],
    logs: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  projects.set(id, project);
  return project;
}

export function getProject(id: string): Project | undefined {
  return projects.get(id);
}

export function updateProject(id: string, updates: Partial<Project>): Project | undefined {
  const project = projects.get(id);
  if (!project) return undefined;
  Object.assign(project, updates, { updatedAt: Date.now() });
  emit(id, "update", project);
  return project;
}

export function addLog(id: string, entry: Omit<LogEntry, "timestamp">): void {
  const project = projects.get(id);
  if (!project) return;
  const log: LogEntry = { ...entry, timestamp: Date.now() };
  project.logs.push(log);
  project.updatedAt = Date.now();
  emit(id, "log", log);
}

export function setPlan(id: string, plan: ProductionPlan): void {
  updateProject(id, { plan, status: "building_dag" });
  emit(id, "plan", plan);
}

export function setDAG(id: string, dag: DAG): void {
  updateProject(id, { dag, status: "generating" });
  emit(id, "dag", dag);
}

export function updateNode(id: string, nodeId: string, updates: Partial<DAGNode>): void {
  const project = projects.get(id);
  if (!project?.dag) return;
  const node = project.dag.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  Object.assign(node, updates);
  project.updatedAt = Date.now();
  emit(id, "node", { nodeId, ...updates });
}

export function setGeneratedFiles(id: string, files: GeneratedFile[]): void {
  updateProject(id, { generatedFiles: files });
  emit(id, "files", files);
}

export function subscribe(
  id: string,
  callback: (event: string, data: unknown) => void
): () => void {
  if (!listeners.has(id)) listeners.set(id, new Set());
  listeners.get(id)!.add(callback);
  return () => listeners.get(id)?.delete(callback);
}

function emit(id: string, event: string, data: unknown): void {
  listeners.get(id)?.forEach((cb) => cb(event, data));
}
