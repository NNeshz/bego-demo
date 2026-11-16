import { CITIES } from "@retorno/db";
import type { GenerateObjectRequest, LlmClient } from "../llm";

export const cities = CITIES.map(({ id, name, state }) => ({ id, name, state }));

/** Monday 2026-11-16, 10:00 in Mexico City. */
export const NOW = new Date("2026-11-16T16:00:00.000Z");
export const now = () => NOW;

/** Mexico City wall-clock time → UTC ISO string. */
export const mx = (date: string, time: string) =>
  new Date(`${date}T${time}:00-06:00`).toISOString();

type Responder = (request: GenerateObjectRequest<unknown>) => unknown | Promise<unknown>;

/** Fake LLM: records calls and answers with whatever the test wants. */
export function fakeLlm(respond: Responder) {
  const calls: GenerateObjectRequest<unknown>[] = [];
  const client: LlmClient = {
    async generateObject<T>(request: GenerateObjectRequest<T>): Promise<T> {
      calls.push(request as GenerateObjectRequest<unknown>);
      return (await respond(request as GenerateObjectRequest<unknown>)) as T;
    },
  };
  return { client, calls };
}

/** An LLM that never answers until aborted (to exercise timeouts). */
export function hangingLlm(): LlmClient {
  return {
    generateObject: (request) =>
      new Promise((_, reject) => {
        request.signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  };
}
