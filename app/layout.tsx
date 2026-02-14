import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Website Generator Agent",
  description: "AI-powered website generation using Claude Opus 4.6 agent orchestration",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-[var(--border-color)] px-6 py-4">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-[var(--accent)] flex items-center justify-center text-white font-bold text-sm">
                WG
              </div>
              <h1 className="text-lg font-semibold text-[var(--text-primary)]">
                Website Generator
              </h1>
            </div>
            <span className="text-xs text-[var(--text-secondary)]">
              Powered by Claude Opus 4.6
            </span>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
