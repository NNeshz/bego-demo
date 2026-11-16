import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export interface GenerateObjectRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  signal: AbortSignal;
}

/**
 * The only thing the rest of the package knows about LLMs.
 * Tests inject a fake; production uses Claude with native structured outputs.
 */
export interface LlmClient {
  generateObject<T>(request: GenerateObjectRequest<T>): Promise<T>;
}

export interface AnthropicClientOptions {
  apiKey: string;
  model: string;
}

/**
 * Claude with structured outputs (`output_config.format` = JSON Schema derived
 * from Zod). The API constrains decoding to the schema and the SDK validates the
 * result with the same Zod schema before returning it.
 */
export function createAnthropicClient({ apiKey, model }: AnthropicClientOptions): LlmClient {
  // Retries are disabled: callers have a tight timeout and a deterministic fallback.
  const client = new Anthropic({ apiKey, maxRetries: 0 });

  return {
    async generateObject<T>({
      system,
      prompt,
      schema,
      maxTokens,
      signal,
    }: GenerateObjectRequest<T>) {
      const message = await client.messages.parse(
        {
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: prompt }],
          output_config: { format: zodOutputFormat(schema) },
        },
        { signal },
      );
      if (message.parsed_output == null) {
        throw new Error(`No structured output (stop_reason: ${message.stop_reason})`);
      }
      return message.parsed_output as T;
    },
  };
}
