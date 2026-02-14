"use client";

import type { DAG, DAGNode } from "@/lib/types";

const NODE_STATUS_STYLES: Record<
  DAGNode["status"],
  { bg: string; border: string; text: string }
> = {
  pending: {
    bg: "var(--bg-tertiary)",
    border: "var(--border-color)",
    text: "var(--text-secondary)",
  },
  running: {
    bg: "color-mix(in srgb, var(--accent) 10%, transparent)",
    border: "var(--accent)",
    text: "var(--accent)",
  },
  success: {
    bg: "color-mix(in srgb, var(--success) 10%, transparent)",
    border: "var(--success)",
    text: "var(--success)",
  },
  error: {
    bg: "color-mix(in srgb, var(--error) 10%, transparent)",
    border: "var(--error)",
    text: "var(--error)",
  },
};

const NODE_TYPE_LABELS: Record<DAGNode["type"], string> = {
  codegen: "CodeGen",
  merge: "Merge",
  review: "Review",
};

export function DAGView({ dag }: { dag: DAG }) {
  // Build a node lookup for O(1) access
  const nodeMap = new Map(dag.nodes.map((n) => [n.id, n]));

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-[var(--text-secondary)]">
            Execution DAG
          </h3>
          <div className="flex gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[var(--text-secondary)]" />
              Pending
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse-dot" />
              Running
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[var(--success)]" />
              Done
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[var(--error)]" />
              Error
            </span>
          </div>
        </div>

        {/* Render by depth level */}
        <div className="space-y-8">
          {dag.depths.map((depth, depthIndex) => (
            <div key={depth.depth}>
              <div className="mb-2 text-xs font-medium text-[var(--text-secondary)]/60">
                Depth {depth.depth}
                {depth.nodeIds.length > 1 && ` (${depth.nodeIds.length} parallel)`}
              </div>

              <div className="flex flex-wrap gap-3">
                {depth.nodeIds.map((nodeId) => {
                  const node = nodeMap.get(nodeId);
                  if (!node) return null;
                  const style = NODE_STATUS_STYLES[node.status];

                  return (
                    <div
                      key={nodeId}
                      className="flex-1 min-w-[200px] max-w-[350px] rounded-lg p-4 transition-all"
                      style={{
                        backgroundColor: style.bg,
                        border: `1px solid ${style.border}`,
                      }}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                          style={{
                            color: style.text,
                            backgroundColor: `color-mix(in srgb, ${style.text} 15%, transparent)`,
                          }}
                        >
                          {NODE_TYPE_LABELS[node.type]}
                        </span>
                        {node.status === "running" && (
                          <span
                            className="h-2 w-2 rounded-full animate-pulse-dot"
                            style={{ backgroundColor: style.text }}
                          />
                        )}
                        {node.status === "success" && (
                          <span style={{ color: style.text }} className="text-xs">
                            Done
                          </span>
                        )}
                      </div>
                      <div
                        className="text-sm font-medium"
                        style={{ color: style.text }}
                      >
                        {node.label}
                      </div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">
                        {node.description.length > 100
                          ? node.description.substring(0, 100) + "..."
                          : node.description}
                      </div>
                      {node.output && (
                        <div className="mt-2 text-[10px] text-[var(--text-secondary)]">
                          {node.output.files.length} files
                          {node.output.testResults &&
                            `, ${node.output.testResults.filter((t) => t.passed).length}/${node.output.testResults.length} tests`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Arrow connector to next depth */}
              {depthIndex < dag.depths.length - 1 && (
                <div className="flex justify-center py-2">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="text-[var(--border-color)]"
                  >
                    <path
                      d="M12 5v14m0 0l-5-5m5 5l5-5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Total Nodes"
          value={dag.nodes.length}
        />
        <Stat
          label="CodeGen"
          value={dag.nodes.filter((n) => n.type === "codegen").length}
        />
        <Stat
          label="Merge"
          value={dag.nodes.filter((n) => n.type === "merge").length}
        />
        <Stat
          label="Completed"
          value={dag.nodes.filter((n) => n.status === "success").length}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 text-center">
      <div className="text-2xl font-bold text-[var(--text-primary)]">{value}</div>
      <div className="text-xs text-[var(--text-secondary)]">{label}</div>
    </div>
  );
}
