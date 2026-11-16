import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("runs in fallback mode when no external services are configured", () => {
    const env = parseEnv({});
    expect(env.aiEnabled).toBe(false);
    expect(env.dbEnabled).toBe(false);
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("treats empty strings as unset", () => {
    const env = parseEnv({ ANTHROPIC_API_KEY: "", DATABASE_URL: "  " });
    expect(env.aiEnabled).toBe(false);
    expect(env.dbEnabled).toBe(false);
  });

  it("enables services when configured", () => {
    const env = parseEnv({
      ANTHROPIC_API_KEY: "sk-ant-test",
      DATABASE_URL: "postgresql://user:pass@host/db",
    });
    expect(env.aiEnabled).toBe(true);
    expect(env.dbEnabled).toBe(true);
  });

  it("rejects malformed values with a readable message", () => {
    expect(() => parseEnv({ DATABASE_URL: "not-a-url" })).toThrow(/DATABASE_URL/);
  });
});
