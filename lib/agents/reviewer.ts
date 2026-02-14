import { query } from "@anthropic-ai/claude-agent-sdk";
import { ReviewInput, NodeOutput } from "../types";
import { addLog } from "../store";
import { collectResult, parseAgentResult } from "./utils";

const REVIEWER_SYSTEM_PROMPT = `You are an expert code reviewer and QA agent. You perform the final review of a complete generated codebase.

Your review process:
1. **Read** every single file in the generated codebase
2. **Analyze** for errors, security vulnerabilities, edge cases, missing error handling, and architectural issues
3. **Fix** any issues you find by rewriting the affected files
4. **Build** the entire project to verify it compiles
5. **Test** run the full test suite
6. **E2E Test** attempt to run the project end-to-end (start the server, verify it responds)

Specific things to check:
- All imports resolve correctly
- No circular dependencies
- Proper error handling at all boundaries
- No hardcoded secrets or credentials
- Environment variables are properly configured
- Package.json has all required dependencies
- TypeScript types are correct and complete
- No unused variables or dead code
- Edge cases are handled (empty inputs, null values, network errors)
- Security: no SQL injection, XSS, CSRF vulnerabilities
- Performance: no obvious N+1 queries, memory leaks, or blocking operations

Write corrected files to the workspace directory.

After review, output final JSON:
{
  "files": [{"path": "relative/path.ts", "content": "file content", "language": "typescript"}],
  "testResults": [{"name": "test name", "passed": true, "output": "test output"}],
  "buildSuccess": true,
  "reviewNotes": "Detailed review findings and fixes applied"
}

Return ONLY the JSON. No markdown, no code fences.`;

export async function runReviewerAgent(
  projectId: string,
  nodeId: string,
  input: ReviewInput,
  sourceOutput: NodeOutput,
  workspacePath: string
): Promise<NodeOutput> {
  addLog(projectId, {
    level: "info",
    agent: "reviewer",
    nodeId,
    message: "Starting final review and E2E testing...",
  });

  const filesDescription = sourceOutput.files
    .map((f) => `- ${f.path} (${f.language})`)
    .join("\n");

  const filesJSON = JSON.stringify(
    sourceOutput.files.map((f) => ({
      path: f.path,
      content: f.content,
      language: f.language,
    })),
    null,
    2
  );

  const prompt = `Perform a thorough final review of this generated codebase in the workspace at ${workspacePath}.

Original Plan:
${input.fullPlan}

Generated Files:
${filesDescription}

FILE CONTENTS:
${filesJSON}

Your tasks:
1. Write all files to the workspace directory
2. Read through every file carefully checking for errors, edge cases, and security issues
3. Fix any issues you find
4. Build the entire project
5. Run all tests
6. Attempt to start the project and verify it works end-to-end
7. Report your findings

When done, output the final reviewed codebase as JSON matching the schema in your instructions.`;

  const conversation = query({
    prompt,
    options: {
      model: "claude-opus-4-6",
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      cwd: workspacePath,
      tools: { type: "preset", preset: "claude_code" },
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: 40,
      outputFormat: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  content: { type: "string" },
                  language: { type: "string" },
                },
                required: ["path", "content", "language"],
              },
            },
            testResults: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  passed: { type: "boolean" },
                  output: { type: "string" },
                },
                required: ["name", "passed", "output"],
              },
            },
            buildSuccess: { type: "boolean" },
            reviewNotes: { type: "string" },
          },
          required: ["files", "testResults", "buildSuccess"],
        },
      },
    },
  });

  const resultText = await collectResult(conversation);
  const output = parseAgentResult<NodeOutput>(resultText, "reviewer");

  const passedTests = output.testResults?.filter((t) => t.passed).length ?? 0;
  const totalTests = output.testResults?.length ?? 0;

  addLog(projectId, {
    level: output.buildSuccess ? "success" : "warn",
    agent: "reviewer",
    nodeId,
    message: `Review complete: ${output.files.length} files, ${passedTests}/${totalTests} tests, build ${output.buildSuccess ? "succeeded" : "failed"}. ${output.reviewNotes ?? ""}`,
  });

  return output;
}
