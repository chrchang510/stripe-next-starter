"use client";

import type { ProductionPlan } from "@/lib/types";

export function PlanView({ plan }: { plan: ProductionPlan }) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6">
        <h3 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">Summary</h3>
        <p className="text-[var(--text-primary)]">{plan.summary}</p>
      </div>

      {/* Architecture */}
      <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6">
        <h3 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">Architecture</h3>
        <p className="whitespace-pre-wrap text-[var(--text-primary)]">{plan.architecture}</p>
      </div>

      {/* Tech Stack */}
      <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6">
        <h3 className="mb-3 text-sm font-medium text-[var(--text-secondary)]">Tech Stack</h3>
        <div className="flex flex-wrap gap-2">
          {plan.techStack.map((tech) => (
            <span
              key={tech}
              className="rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/30 px-3 py-1 text-xs text-[var(--accent)]"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>

      {/* Modules */}
      <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6">
        <h3 className="mb-4 text-sm font-medium text-[var(--text-secondary)]">
          Modules ({plan.modules.length})
        </h3>
        <div className="space-y-4">
          {plan.modules.map((mod, i) => (
            <div
              key={mod.name}
              className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--accent)]/20 text-xs font-bold text-[var(--accent)]">
                  {i + 1}
                </span>
                <span className="font-medium text-[var(--text-primary)]">{mod.name}</span>
              </div>
              <p className="mb-3 text-sm text-[var(--text-secondary)]">{mod.description}</p>

              {mod.dependencies.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs text-[var(--text-secondary)]">Depends on: </span>
                  {mod.dependencies.map((dep) => (
                    <span
                      key={dep}
                      className="mr-1 inline-block rounded bg-[var(--warning)]/10 px-2 py-0.5 text-xs text-[var(--warning)]"
                    >
                      {dep}
                    </span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="mb-1 text-[var(--text-secondary)]">Files:</div>
                  {mod.files.map((f) => (
                    <div key={f} className="text-[var(--text-primary)]/80">
                      {f}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="mb-1 text-[var(--text-secondary)]">Tests:</div>
                  {mod.tests.map((t) => (
                    <div key={t} className="text-[var(--text-primary)]/80">
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Test Strategy */}
      <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6">
        <h3 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">Test Strategy</h3>
        <p className="whitespace-pre-wrap text-[var(--text-primary)]">{plan.testStrategy}</p>
      </div>
    </div>
  );
}
