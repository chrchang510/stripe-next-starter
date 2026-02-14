"use client";

import type { ProjectStatus } from "@/lib/types";

const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; color: string; animate: boolean }
> = {
  pending: { label: "Pending", color: "var(--text-secondary)", animate: false },
  planning: { label: "Planning", color: "var(--accent)", animate: true },
  building_dag: { label: "Building DAG", color: "var(--accent)", animate: true },
  generating: { label: "Generating", color: "var(--accent)", animate: true },
  merging: { label: "Merging", color: "var(--accent)", animate: true },
  reviewing: { label: "Reviewing", color: "var(--warning)", animate: true },
  complete: { label: "Complete", color: "var(--success)", animate: false },
  error: { label: "Error", color: "var(--error)", animate: false },
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        color: config.color,
        backgroundColor: `color-mix(in srgb, ${config.color} 15%, transparent)`,
        border: `1px solid color-mix(in srgb, ${config.color} 30%, transparent)`,
      }}
    >
      {config.animate && (
        <span
          className="h-1.5 w-1.5 rounded-full animate-pulse-dot"
          style={{ backgroundColor: config.color }}
        />
      )}
      {config.label}
    </span>
  );
}
