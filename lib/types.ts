export interface Project {
  id: string;
  prompt: string;
  githubUrl?: string;
  status: ProjectStatus;
  plan?: ProductionPlan;
  dag?: DAG;
  generatedFiles: GeneratedFile[];
  logs: LogEntry[];
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export type ProjectStatus =
  | "pending"
  | "planning"
  | "building_dag"
  | "generating"
  | "merging"
  | "reviewing"
  | "complete"
  | "error";

export interface ProductionPlan {
  summary: string;
  architecture: string;
  techStack: string[];
  modules: PlanModule[];
  testStrategy: string;
}

export interface PlanModule {
  name: string;
  description: string;
  dependencies: string[];
  files: string[];
  tests: string[];
}

export interface DAG {
  nodes: DAGNode[];
  edges: DAGEdge[];
  depths: DAGDepth[];
}

export interface DAGNode {
  id: string;
  type: "codegen" | "merge" | "review";
  label: string;
  description: string;
  status: "pending" | "running" | "success" | "error";
  input: CodeGenInput | MergeInput | ReviewInput;
  output?: NodeOutput;
  depth: number;
}

export interface DAGEdge {
  from: string;
  to: string;
}

export interface DAGDepth {
  depth: number;
  nodeIds: string[];
}

export interface CodeGenInput {
  type: "codegen";
  moduleName: string;
  description: string;
  files: string[];
  tests: string[];
  dependencies: string[];
  planContext: string;
}

export interface MergeInput {
  type: "merge";
  sourceNodeIds: string[];
  mergeDescription: string;
  expectedFiles: string[];
}

export interface ReviewInput {
  type: "review";
  sourceNodeId: string;
  fullPlan: string;
}

export interface NodeOutput {
  files: GeneratedFile[];
  testResults?: TestResult[];
  buildSuccess: boolean;
  reviewNotes?: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
  language: string;
}

export interface TestResult {
  name: string;
  passed: boolean;
  output: string;
}

export interface LogEntry {
  timestamp: number;
  level: "info" | "warn" | "error" | "success";
  agent: string;
  message: string;
  nodeId?: string;
}

export interface REACTStep {
  thought: string;
  action: string;
  observation: string;
  reflection: string;
}
