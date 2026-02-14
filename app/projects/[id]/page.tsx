"use client";

import { useEffect, useState, useRef, use } from "react";
import type { Project, LogEntry, DAG, ProductionPlan, GeneratedFile, NodeUpdateEvent } from "@/lib/types";
import { PlanView } from "@/components/PlanView";
import { DAGView } from "@/components/DAGView";
import { LogPanel } from "@/components/LogPanel";
import { CodeViewer } from "@/components/CodeViewer";
import { StatusBadge } from "@/components/StatusBadge";

type Tab = "logs" | "plan" | "dag" | "code";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("logs");
  const [error, setError] = useState("");
  const retryCountRef = useRef(0);

  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;

    function connect() {
      if (closed) return;
      es = new EventSource(`/api/projects/${id}/stream`);

      es.onopen = () => {
        retryCountRef.current = 0;
        setError("");
      };

      es.onmessage = (event) => {
        let parsed: { event: string; data: unknown };
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return; // Ignore malformed SSE messages
        }
        const { event: eventType, data } = parsed;

        switch (eventType) {
          case "init":
            setProject(data as Project);
            setLogs((data as Project).logs || []);
            break;
          case "update":
            setProject(data as Project);
            break;
          case "log":
            setLogs((prev) => [...prev, data as LogEntry]);
            break;
          case "plan":
            setProject((prev) =>
              prev ? { ...prev, plan: data as ProductionPlan, status: "building_dag" } : null
            );
            setActiveTab("plan");
            break;
          case "dag":
            setProject((prev) =>
              prev ? { ...prev, dag: data as DAG, status: "generating" } : null
            );
            setActiveTab("dag");
            break;
          case "node": {
            const nodeUpdate = data as NodeUpdateEvent;
            setProject((prev) => {
              if (!prev?.dag) return prev;
              const nodes = prev.dag.nodes.map((n) =>
                n.id === nodeUpdate.nodeId
                  ? { ...n, status: nodeUpdate.status ?? n.status, output: nodeUpdate.output ?? n.output }
                  : n
              );
              return { ...prev, dag: { ...prev.dag, nodes } };
            });
            break;
          }
          case "files":
            setProject((prev) =>
              prev
                ? { ...prev, generatedFiles: data as GeneratedFile[] }
                : null
            );
            setActiveTab("code");
            break;
        }
      };

      es.onerror = () => {
        if (closed) return;
        es?.close();
        retryCountRef.current++;
        if (retryCountRef.current <= 5) {
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s
          const delay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 16000);
          setTimeout(connect, delay);
        } else {
          setError("Connection lost. Please refresh to reconnect.");
        }
      };
    }

    connect();

    return () => {
      closed = true;
      es?.close();
    };
  }, [id]);

  if (error && !project) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="rounded-lg border border-[color-mix(in_srgb,var(--error)_30%,transparent)] bg-[color-mix(in_srgb,var(--error)_10%,transparent)] p-6 text-center" style={{ color: "var(--error)" }}>
          {error}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex items-center justify-center py-20" role="status" aria-live="polite">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" aria-hidden="true" />
          <span className="ml-3 text-[var(--text-secondary)]">Loading project...</span>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; enabled: boolean }[] = [
    { key: "logs", label: "Logs", enabled: true },
    { key: "plan", label: "Plan", enabled: !!project.plan },
    { key: "dag", label: "DAG", enabled: !!project.dag },
    { key: "code", label: "Code", enabled: project.generatedFiles.length > 0 },
  ];

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">
              Project
            </h2>
            <StatusBadge status={project.status} />
          </div>
          <p className="max-w-2xl text-sm text-[var(--text-secondary)]">
            {project.prompt.length > 200
              ? project.prompt.substring(0, 200) + "..."
              : project.prompt}
          </p>
        </div>
        <div className="text-right text-xs text-[var(--text-secondary)]">
          <div>ID: {project.id.substring(0, 8)}</div>
          <div>{new Date(project.createdAt).toLocaleString()}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-[var(--border-color)]" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`tabpanel-${tab.key}`}
            onClick={() => tab.enabled && setActiveTab(tab.key)}
            disabled={!tab.enabled}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                : tab.enabled
                  ? "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  : "cursor-not-allowed opacity-40 text-[var(--text-secondary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[600px]">
        <div role="tabpanel" id={`tabpanel-${activeTab}`}>
          {activeTab === "logs" && <LogPanel logs={logs} />}
          {activeTab === "plan" && project.plan && <PlanView plan={project.plan} />}
          {activeTab === "dag" && project.dag && <DAGView dag={project.dag} />}
          {activeTab === "code" && <CodeViewer files={project.generatedFiles} />}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-[var(--warning)] px-4 py-3 text-sm" style={{ color: "var(--warning)", borderColor: "color-mix(in srgb, var(--warning) 30%, transparent)", backgroundColor: "color-mix(in srgb, var(--warning) 10%, transparent)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
