import { query } from "@anthropic-ai/claude-agent-sdk";
import { MergeInput, NodeOutput, GeneratedFile } from "../types";
import { addLog } from "../store";
import { collectResult, parseAgentResult } from "./utils";

const MERGER_SYSTEM_PROMPT = `You are an expert code merging agent. Your job is to take code from multiple independently-generated modules and merge them into a cohesive, working codebase.

You operate in a REACT loop:
1. **Reason** about how the code modules fit together, identify conflicts and integration points
2. **Act** by writing the merged code files to the workspace directory
3. **Check** by building the merged code and running all tests
4. **Test** by verifying everything works together and fixing any integration issues

When merging, you must:
- Resolve any naming conflicts between modules
- Ensure imports reference the correct merged paths
- Create any missing shared types or interfaces
- Merge configuration files (package.json, tsconfig, etc.) properly
- Ensure all tests from all modules still pass after merging
- Add integration tests where modules interact

Write merged files to the workspace directory provided. Use absolute paths.

After all iterations, output a final summary as JSON:
{
  "files": [{"path": "relative/path.ts", "content": "file content", "language": "typescript"}],
  "testResults": [{"name": "test name", "passed": true, "output": "test output"}],
  "buildSuccess": true,
  "reviewNotes": "Summary of merge decisions and any issues"
}

Return ONLY the JSON. No markdown, no code fences.`;

export async function runMergerAgent(
  projectId: string,
  nodeId: string,
  input: MergeInput,
  sourceOutputs: Map<string, NodeOutput>,
  workspacePath: string
): Promise<NodeOutput> {
  addLog(projectId, {
    level: "info",
    agent: "merger",
    nodeId,
    message: `Starting merge of ${input.sourceNodeIds.length} modules`,
  });

  // Collect all files from source nodes
  const allFiles: { sourceNode: string; files: GeneratedFile[] }[] = [];
  for (const sourceId of input.sourceNodeIds) {
    const output = sourceOutputs.get(sourceId);
    if (output) {
      allFiles.push({ sourceNode: sourceId, files: output.files });
    } else {
      addLog(projectId, {
        level: "warn",
        agent: "merger",
        nodeId,
        message: `Source node ${sourceId} has no output (may have failed) - skipping`,
      });
    }
  }

  const filesDescription = allFiles
    .map(
      (s) =>
        `Source ${s.sourceNode}:\n${s.files.map((f) => `  - ${f.path} (${f.language})`).join("\n")}`
    )
    .join("\n\n");

  // Write source files to workspace subdirectories for the agent to read
  const sourceFilesJSON = JSON.stringify(
    allFiles.map((s) => ({
      sourceNode: s.sourceNode,
      files: s.files.map((f) => ({ path: f.path, content: f.content, language: f.language })),
    })),
    null,
    2
  );

  const prompt = `Merge the following code modules into a single cohesive codebase in the workspace at ${workspacePath}:

${input.mergeDescription}

Source modules and their files:
${filesDescription}

The full file contents from each source module are provided below as JSON. Read them, merge them, write the merged files, then build and test.

SOURCE FILES JSON:
${sourceFilesJSON}

Expected output files after merge:
${input.expectedFiles.map((f) => `- ${f}`).join("\n")}

Follow the REACT loop:
1. Read and understand all source code
2. Write merged files resolving any conflicts
3. Build the merged code
4. Run all tests
5. Fix any issues and repeat

When done, output the final result as JSON matching the schema in your instructions.`;

  const conversation = query({
    prompt,
    options: {
      model: "claude-opus-4-6",
      systemPrompt: MERGER_SYSTEM_PROMPT,
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
  const output = parseAgentResult<NodeOutput>(resultText, "merger");

  addLog(projectId, {
    level: output.buildSuccess ? "success" : "warn",
    agent: "merger",
    nodeId,
    message: `Merge complete: ${output.files.length} files, build ${output.buildSuccess ? "succeeded" : "failed"}`,
  });

  return output;
}
