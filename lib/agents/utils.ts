import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * Collects the result from an Agent SDK query conversation.
 * Handles both success and error result subtypes, throwing
 * descriptive errors for non-success outcomes.
 */
export async function collectResult(
  conversation: AsyncGenerator<SDKMessage, void>
): Promise<string> {
  let resultText = "";
  const errors: string[] = [];

  for await (const message of conversation) {
    if (message.type === "result") {
      if (message.subtype === "success") {
        resultText = message.result;
      } else {
        // Handle error subtypes: error_max_turns, error_during_execution,
        // error_max_budget_usd, error_max_structured_output_retries
        if ("errors" in message && Array.isArray(message.errors)) {
          errors.push(...message.errors);
        }
        throw new Error(
          `Agent ended with ${message.subtype}: ${errors.join("; ") || "unknown error"}`
        );
      }
    }
  }

  if (!resultText) {
    throw new Error("Agent produced no result output");
  }

  return resultText;
}

/**
 * Safely parses JSON from an agent result string.
 * Provides a descriptive error message on parse failure.
 */
export function parseAgentResult<T>(resultText: string, agentName: string): T {
  try {
    return JSON.parse(resultText) as T;
  } catch {
    throw new Error(
      `${agentName} returned invalid JSON: ${resultText.substring(0, 200)}`
    );
  }
}
