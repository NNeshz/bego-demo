import { describe, expect, it } from "vitest";
import { ENGINE_NAME } from "./index";

describe("engine package", () => {
  it("is wired up", () => {
    expect(ENGINE_NAME).toBe("retorno-engine");
  });
});
