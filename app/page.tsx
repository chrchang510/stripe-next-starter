"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          githubUrl: githubUrl.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start generation");
      }

      const { projectId } = await res.json();
      router.push(`/projects/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-12 text-center">
        <h2 className="mb-4 text-4xl font-bold tracking-tight text-[var(--text-primary)]">
          Generate a Website
        </h2>
        <p className="text-lg text-[var(--text-secondary)]">
          Describe what you want to build. Our multi-agent system will plan,
          generate, test, and review your code.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label
            htmlFor="prompt"
            className="mb-2 block text-sm font-medium text-[var(--text-secondary)]"
          >
            Project Description
          </label>
          <textarea
            id="prompt"
            rows={6}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the website you want to build. Be specific about features, pages, tech stack preferences, and any design requirements..."
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none"
            disabled={loading}
          />
        </div>

        <div>
          <label
            htmlFor="githubUrl"
            className="mb-2 block text-sm font-medium text-[var(--text-secondary)]"
          >
            GitHub Repository URL{" "}
            <span className="text-[var(--text-secondary)]/60">(optional)</span>
          </label>
          <input
            id="githubUrl"
            type="url"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            placeholder="https://github.com/user/repo"
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            disabled={loading}
          />
        </div>

        {error && (
          <div className="rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/10 px-4 py-3 text-sm text-[var(--error)]">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="w-full rounded-lg bg-[var(--accent)] px-6 py-3 font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Starting generation..." : "Generate Website"}
        </button>
      </form>

      <div className="mt-16 grid grid-cols-1 gap-6 text-center sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6">
          <div className="mb-2 text-2xl font-bold text-[var(--accent)]">1</div>
          <h3 className="mb-1 font-medium text-[var(--text-primary)]">Plan</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            AI architect analyzes your prompt and researches best practices
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6">
          <div className="mb-2 text-2xl font-bold text-[var(--accent)]">2</div>
          <h3 className="mb-1 font-medium text-[var(--text-primary)]">Generate</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Parallel agents generate, test, and merge code modules
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6">
          <div className="mb-2 text-2xl font-bold text-[var(--accent)]">3</div>
          <h3 className="mb-1 font-medium text-[var(--text-primary)]">Review</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Final agent reviews everything and runs end-to-end tests
          </p>
        </div>
      </div>
    </div>
  );
}
