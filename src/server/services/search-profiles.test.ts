import { describe, it, expect } from "vitest";
import {
  SearchProfileCreateSchema,
  SearchProfilePatchSchema,
  SearchProfileListQuerySchema,
} from "../schemas/search-profiles";

describe("SearchProfileCreateSchema", () => {
  it("accepts a complete valid input", () => {
    const result = SearchProfileCreateSchema.parse({
      name: "FR · général",
      country: "FR",
      language: "fr",
      category: "general",
      terms: ["maison à rénover"],
    });
    expect(result.active).toBe(true);
  });

  it("rejects an empty terms array", () => {
    expect(() =>
      SearchProfileCreateSchema.parse({
        name: "X",
        country: "FR",
        language: "fr",
        category: "general",
        terms: [],
      }),
    ).toThrow();
  });

  it("rejects an invalid category", () => {
    expect(() =>
      SearchProfileCreateSchema.parse({
        name: "X",
        country: "FR",
        language: "fr",
        category: "made_up" as never,
        terms: ["x"],
      }),
    ).toThrow();
  });

  it("rejects an invalid country", () => {
    expect(() =>
      SearchProfileCreateSchema.parse({
        name: "X",
        country: "ES" as never,
        language: "fr",
        category: "general",
        terms: ["x"],
      }),
    ).toThrow();
  });
});

describe("SearchProfilePatchSchema", () => {
  it("accepts partial input", () => {
    const result = SearchProfilePatchSchema.parse({ active: false });
    expect(result.active).toBe(false);
    expect(result.name).toBeUndefined();
  });
});

describe("SearchProfileListQuerySchema", () => {
  it("parses csv country filter", () => {
    const result = SearchProfileListQuerySchema.parse({ country: "FR,DE" });
    expect(result.country).toEqual(["FR", "DE"]);
  });

  it("active=true via string is coerced to boolean", () => {
    const result = SearchProfileListQuerySchema.parse({ active: "true" });
    expect(result.active).toBe(true);
  });
});
