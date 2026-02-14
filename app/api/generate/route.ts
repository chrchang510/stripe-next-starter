import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { createProject } from "@/lib/store";
import { runPipeline } from "@/lib/agents/pipeline";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { prompt, githubUrl } = body as { prompt: string; githubUrl?: string };

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const projectId = uuid();
  createProject(projectId, prompt.trim(), githubUrl);

  // Start pipeline in background (non-blocking)
  runPipeline(projectId, prompt.trim(), githubUrl).catch((err) => {
    console.error(`Pipeline error for project ${projectId}:`, err);
  });

  return NextResponse.json({ projectId });
}
