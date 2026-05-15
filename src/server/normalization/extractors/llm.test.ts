import { describe, it, expect } from "vitest";
import { LlmExtractor } from "./llm";

describe("LlmExtractor (placeholder)", () => {
  const e = new LlmExtractor();

  it("has a stable name", () => {
    expect(e.name).toBe("llm-v0-stub");
  });

  it("extract() throws — fase 5+ implementation required", async () => {
    await expect(
      e.extract({
        sourceId: "s1",
        url: "https://x.fr",
        title: "test",
        country: "FR",
      }),
    ).rejects.toThrow(/placeholder for fase 5/i);
  });
});
