"use client";

import { useEffect, useRef } from "react";
import type { LogEntry } from "@/lib/types";

const LEVEL_STYLES: Record<LogEntry["level"], { color: string; prefix: string }> = {
  info: { color: "var(--text-secondary)", prefix: "INFO" },
  warn: { color: "var(--warning)", prefix: "WARN" },
  error: { color: "var(--error)", prefix: "ERR " },
  success: { color: "var(--success)", prefix: " OK " },
};

export function LogPanel({ logs }: { logs: LogEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--text-secondary)]">
        Waiting for logs...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] overflow-hidden">
      <div className="px-4 py-2 border-b border-[var(--border-color)] text-xs font-medium text-[var(--text-secondary)]">
        Agent Logs ({logs.length})
      </div>
      <div className="max-h-[600px] overflow-y-auto p-4 font-mono text-xs leading-relaxed" role="log" aria-live="polite">
        {logs.map((log, i) => {
          const style = LEVEL_STYLES[log.level];
          const time = new Date(log.timestamp).toLocaleTimeString();
          return (
            <div key={i} className="animate-slide-in mb-1 flex gap-2">
              <span className="shrink-0 text-[var(--text-secondary)]/60">{time}</span>
              <span
                className="shrink-0 font-bold"
                style={{ color: style.color }}
              >
                [{style.prefix}]
              </span>
              <span
                className="shrink-0 text-[var(--accent)]"
                style={{ minWidth: "80px" }}
              >
                {log.agent}
              </span>
              <span style={{ color: style.color }}>{log.message}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
