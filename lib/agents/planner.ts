import { query } from "@anthropic-ai/claude-agent-sdk";
import { ProductionPlan } from "../types";
import { addLog } from "../store";

const PLANNER_SYSTEM_PROMPT = `You are a senior software architect and production planner. Your job is to take a user's project request and create a detailed production plan for building the software.

You will:
1. Analyze the user's prompt to understand exactly what they want built
2. Research current best practices for the technologies involved using web search
3. If a GitHub codebase URL is provided, analyze the existing code structure
4. Break down the project into discrete modules with clear boundaries
5. Define the tech stack, architecture, and file structure
6. Specify tests for each module

Your output MUST be valid JSON matching this schema:
{
  "summary": "Brief description of what will be built",
  "architecture": "Description of the overall architecture (monorepo structure, key patterns)",
  "techStack": ["list", "of", "technologies"],
  "modules": [
    {
      "name": "module-name",
      "description": "What this module does",
      "dependencies": ["other-module-names this depends on"],
      "files": ["src/path/to/file.ts", "src/path/to/other.ts"],
      "tests": ["src/path/to/__tests__/file.test.ts"]
    }
  ],
  "testStrategy": "Overall testing approach"
}

Be thorough but practical. Each module should be independently implementable. Order modules so dependencies come first. Include configuration files, entry points, and shared utilities as separate modules.`;

export async function runPlannerAgent(
  projectId: string,
  userPrompt: string,
  githubUrl?: string
): Promise<ProductionPlan> {
  addLog(projectId, {
    level: "info",
    agent: "planner",
    message: "Starting planning phase...",
  });

  let prompt = `Create a production plan for the following project:\n\n${userPrompt}`;
  if (githubUrl) {
    prompt += `\n\nExisting GitHub codebase to build upon or reference: ${githubUrl}`;
  }
  prompt += `\n\nFirst, do web searches to understand current best practices for the technologies this project will need. Then create a comprehensive production plan.\n\nReturn ONLY valid JSON matching the schema described in your instructions. No markdown, no code fences, just JSON.`;

  addLog(projectId, {
    level: "info",
    agent: "planner",
    message: "Querying Claude Opus 4.6 for production plan...",
  });

  const conversation = query({
    prompt,
    options: {
      model: "claude-opus-4-6",
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      tools: { type: "preset", preset: "claude_code" },
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: 15,
      outputFormat: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            architecture: { type: "string" },
            techStack: { type: "array", items: { type: "string" } },
            modules: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  dependencies: { type: "array", items: { type: "string" } },
                  files: { type: "array", items: { type: "string" } },
                  tests: { type: "array", items: { type: "string" } },
                },
                required: ["name", "description", "dependencies", "files", "tests"],
              },
            },
            testStrategy: { type: "string" },
          },
          required: ["summary", "architecture", "techStack", "modules", "testStrategy"],
        },
      },
    },
  });

  let resultText = "";
  for await (const message of conversation) {
    if (message.type === "result" && message.subtype === "success") {
      resultText = message.result;
    }
  }

  const plan = JSON.parse(resultText) as ProductionPlan;

  addLog(projectId, {
    level: "success",
    agent: "planner",
    message: `Plan created: ${plan.modules.length} modules, tech stack: ${plan.techStack.join(", ")}`,
  });

  return plan;
}
