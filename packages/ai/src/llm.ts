import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export interface GenerateObjectRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  signal: AbortSignal;
  /**
   * Let the model think before answering. Off by default: extraction and
   * one-sentence copy don't need it, and thinking tokens count toward
   * `maxTokens` (and latency, and cost).
   */
  reasoning?: boolean;
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
      reasoning = false,
    }: GenerateObjectRequest<T>) {
      const message = await client.messages.parse(
        {
          model,
          max_tokens: maxTokens,
          // Models with adaptive thinking may decide to reason on their own when
          // `thinking` is omitted; be explicit so short tasks stay short.
          thinking: reasoning ? { type: "adaptive" } : { type: "disabled" },
          system,
          messages: [{ role: "user", content: prompt }],
          output_config: { format: zodOutputFormat(schema) },
        },
        { signal },
      );
      if (message.parsed_output == null) {
        const { output_tokens, output_tokens_details } = message.usage;
        throw new Error(
          `No structured output (stop_reason: ${message.stop_reason}, output_tokens: ${output_tokens}, ` +
            `thinking_tokens: ${output_tokens_details?.thinking_tokens ?? 0}, max_tokens: ${maxTokens})`,
        );
      }
      return message.parsed_output as T;
    },
  };
}
