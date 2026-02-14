import { query } from "@anthropic-ai/claude-agent-sdk";
import { CodeGenInput, NodeOutput } from "../types";
import { addLog } from "../store";
import { collectResult, parseAgentResult } from "./utils";

const MAX_REACT_ITERATIONS = 5;

const CODEGEN_SYSTEM_PROMPT = `You are an expert code generation agent. You generate production-quality code and comprehensive tests.

You operate in a REACT loop:
1. **Reason** about what code needs to be written based on the task description
2. **Act** by writing the code files and test files to the workspace directory
3. **Check** by attempting to build/compile the code and running the tests
4. **Test** by verifying the tests pass and the code achieves its goals

For each iteration, you must:
- Write all specified source files with complete, working implementations
- Write all specified test files with meaningful test cases
- Try to build the code (e.g., run tsc for TypeScript, or the appropriate build tool)
- Run the tests
- If anything fails, analyze the error and fix it in the next iteration

Write files to the workspace directory provided. Use absolute paths.

After all iterations, output a final summary as JSON with this schema:
{
  "files": [{"path": "relative/path.ts", "content": "file content", "language": "typescript"}],
  "testResults": [{"name": "test name", "passed": true, "output": "test output"}],
  "buildSuccess": true,
  "reviewNotes": "Summary of what was built and any issues"
}

Return ONLY the JSON. No markdown, no code fences.`;

export async function runCodeGenAgent(
  projectId: string,
  nodeId: string,
  input: CodeGenInput,
  workspacePath: string
): Promise<NodeOutput> {
  addLog(projectId, {
    level: "info",
    agent: "codegen",
    nodeId,
    message: `Starting code generation for module: ${input.moduleName}`,
  });

  const prompt = `Generate code for the following module in the workspace at ${workspacePath}:

Module: ${input.moduleName}
Description: ${input.description}
Plan Context: ${input.planContext}

Files to generate:
${input.files.map((f) => `- ${f}`).join("\n")}

Tests to generate:
${input.tests.map((t) => `- ${t}`).join("\n")}

Dependencies on other modules: ${input.dependencies.join(", ") || "none"}

Follow the REACT loop:
1. Write all the source files with complete implementations
2. Write all test files with thorough test coverage
3. Try to build/compile the code
4. Run the tests
5. If anything fails, fix it and repeat (up to ${MAX_REACT_ITERATIONS} iterations)

When done, output the final result as JSON matching the schema in your instructions.`;

  const conversation = query({
    prompt,
    options: {
      model: "claude-opus-4-6",
      systemPrompt: CODEGEN_SYSTEM_PROMPT,
      cwd: workspacePath,
      tools: { type: "preset", preset: "claude_code" },
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: 30,
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
  const output = parseAgentResult<NodeOutput>(resultText, "codegen");

  const passedTests = output.testResults?.filter((t) => t.passed).length ?? 0;
  const totalTests = output.testResults?.length ?? 0;

  addLog(projectId, {
    level: output.buildSuccess ? "success" : "warn",
    agent: "codegen",
    nodeId,
    message: `Module ${input.moduleName}: ${output.files.length} files generated, ${passedTests}/${totalTests} tests passed, build ${output.buildSuccess ? "succeeded" : "failed"}`,
  });

  return output;
}
