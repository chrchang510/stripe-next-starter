"use client";

import { useState, useMemo } from "react";
import type { GeneratedFile } from "@/lib/types";

interface FileTreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children: FileTreeNode[];
  file?: GeneratedFile;
}

function buildFileTree(files: GeneratedFile[]): FileTreeNode {
  const root: FileTreeNode = { name: "", path: "", isFile: false, children: [] };

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");

      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path, isFile, children: [], file: isFile ? file : undefined };
        current.children.push(child);
      }
      current = child;
    }
  }

  // Sort: directories first, then alphabetically
  function sortTree(node: FileTreeNode) {
    node.children.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortTree);
  }
  sortTree(root);

  return root;
}

function FileTreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: FileTreeNode;
  depth: number;
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (node.isFile) {
    return (
      <button
        onClick={() => onSelect(node.path)}
        className={`w-full text-left px-2 py-1 text-xs flex items-center gap-1.5 hover:bg-[var(--bg-tertiary)] rounded transition-colors ${
          selectedPath === node.path
            ? "bg-[var(--accent)]/10 text-[var(--accent)]"
            : "text-[var(--text-primary)]"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <FileIcon language={node.file?.language || ""} />
        {node.name}
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-2 py-1 text-xs flex items-center gap-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span className="text-[10px]">{expanded ? "\u25BC" : "\u25B6"}</span>
        {node.name}
      </button>
      {expanded &&
        node.children.map((child) => (
          <FileTreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

function FileIcon({ language }: { language: string }) {
  const colors: Record<string, string> = {
    typescript: "#3178c6",
    javascript: "#f7df1e",
    css: "#264de4",
    html: "#e34f26",
    json: "#a3a3a3",
    markdown: "#a3a3a3",
  };
  const color = colors[language.toLowerCase()] || "var(--text-secondary)";

  return (
    <span
      className="inline-block h-3 w-3 rounded-sm text-[8px] font-bold leading-3 text-center"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 30%, transparent)`, color }}
    >
      {language.charAt(0).toUpperCase()}
    </span>
  );
}

export function CodeViewer({ files }: { files: GeneratedFile[] }) {
  const [selectedPath, setSelectedPath] = useState(files[0]?.path || "");
  const tree = useMemo(() => buildFileTree(files), [files]);
  const selectedFile = files.find((f) => f.path === selectedPath);

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--text-secondary)]">
        No files generated yet.
      </div>
    );
  }

  return (
    <div className="flex rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] overflow-hidden" style={{ height: "650px" }}>
      {/* File tree sidebar */}
      <div className="w-64 shrink-0 border-r border-[var(--border-color)] overflow-y-auto">
        <div className="px-3 py-2 text-xs font-medium text-[var(--text-secondary)] border-b border-[var(--border-color)]">
          Files ({files.length})
        </div>
        <div className="py-1">
          {tree.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={0}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
            />
          ))}
        </div>
      </div>

      {/* Code panel */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selectedFile ? (
          <>
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-2">
                <FileIcon language={selectedFile.language} />
                <span className="text-xs text-[var(--text-primary)]">
                  {selectedFile.path}
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-secondary)]">
                {selectedFile.language}
              </span>
            </div>
            <div className="flex-1 overflow-auto code-viewer">
              <pre className="p-4 m-0 border-0 rounded-none">
                <code className="text-[var(--text-primary)]">
                  {selectedFile.content.split("\n").map((line, i) => (
                    <div key={i} className="flex">
                      <span className="inline-block w-12 shrink-0 text-right pr-4 select-none text-[var(--text-secondary)]/40">
                        {i + 1}
                      </span>
                      <span className="flex-1 whitespace-pre-wrap break-all">
                        {line}
                      </span>
                    </div>
                  ))}
                </code>
              </pre>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--text-secondary)]">
            Select a file to view
          </div>
        )}
      </div>
    </div>
  );
}
