import { describe, it, expect } from "vitest";
import { ManualImportProvider } from "./providers/manual-import";
import { InvalidProviderInputError } from "./errors";

describe("ManualImportProvider", () => {
  const p = new ManualImportProvider();
  const base = {
    country: "FR" as const,
    language: "fr" as const,
    queries: [],
  };

  it("accepts a newline-separated string", async () => {
    const r = await p.discover({
      ...base,
      providerInput: {
        urls: "https://a.fr\nhttps://b.fr\n  \nhttps://c.fr",
      },
    });
    expect(r).toHaveLength(3);
    expect(r.map((c) => c.url)).toEqual([
      "https://a.fr",
      "https://b.fr",
      "https://c.fr",
    ]);
  });

  it("accepts a string array", async () => {
    const r = await p.discover({
      ...base,
      providerInput: { urls: ["https://a.fr", "https://b.fr"] },
    });
    expect(r).toHaveLength(2);
  });

  it("dedups URLs", async () => {
    const r = await p.discover({
      ...base,
      providerInput: { urls: ["https://a.fr", "https://a.fr", "https://b.fr"] },
    });
    expect(r).toHaveLength(2);
  });

  it("filters out non-http(s) URLs", async () => {
    const r = await p.discover({
      ...base,
      providerInput: { urls: ["javascript:alert(1)", "ftp://x", "not a url", "https://ok.fr"] },
    });
    expect(r.map((c) => c.url)).toEqual(["https://ok.fr"]);
  });

  it("embeds country/language in the discoveryReason", async () => {
    const r = await p.discover({
      ...base,
      region: "Lorraine",
      providerInput: { urls: ["https://x.fr"] },
    });
    expect(r[0]!.discoveryReason).toMatch(/Handmatig/);
    expect(r[0]!.discoveryReason).toMatch(/FR/);
    expect(r[0]!.discoveryReason).toMatch(/Lorraine/);
  });

  it("throws InvalidProviderInputError when urls is missing", async () => {
    await expect(p.discover({ ...base })).rejects.toBeInstanceOf(
      InvalidProviderInputError,
    );
  });
});
