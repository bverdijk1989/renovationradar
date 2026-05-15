import { describe, it, expect } from "vitest";
import {
  describeQuery,
  hashQuery,
  normalisedQueryString,
  queryUpperBoundConfidence,
} from "./normalize";

describe("query normalisation", () => {
  it("identical queries produce identical hashes regardless of case/accents", () => {
    const a = hashQuery({
      country: "FR",
      city: "Bar-le-Duc",
      region: "Lorraine",
      postalCode: "55000",
      addressLine: "Rue de l'Église",
    });
    const b = hashQuery({
      country: "FR",
      city: "BAR-LE-DUC",
      region: "LORRAINE",
      postalCode: "55000",
      addressLine: "rue de l'eglise",
    });
    expect(a).toBe(b);
  });

  it("different queries produce different hashes", () => {
    const a = hashQuery({ country: "FR", city: "Paris" });
    const b = hashQuery({ country: "FR", city: "Lyon" });
    expect(a).not.toBe(b);
  });

  it("normalised string preserves country + uses pipe separator", () => {
    const s = normalisedQueryString({
      country: "DE",
      city: "Brilon",
      region: "NRW",
    });
    expect(s.startsWith("DE|")).toBe(true);
    expect(s.split("|")).toHaveLength(5);
  });

  it("describeQuery is human-readable", () => {
    const s = describeQuery({
      country: "BE",
      city: "Modave",
      region: "Liège",
      postalCode: "4577",
      addressLine: "Rue X 1",
    });
    expect(s).toContain("Modave");
    expect(s).toContain("4577");
    expect(s).toContain("BE");
  });
});

describe("queryUpperBoundConfidence", () => {
  it("full address (street + postal + city) → high", () => {
    expect(
      queryUpperBoundConfidence({
        country: "FR",
        addressLine: "X",
        postalCode: "75000",
        city: "Paris",
      }),
    ).toBe("high");
  });

  it("postal + city → high", () => {
    expect(
      queryUpperBoundConfidence({
        country: "FR",
        postalCode: "75000",
        city: "Paris",
      }),
    ).toBe("high");
  });

  it("city only → medium", () => {
    expect(queryUpperBoundConfidence({ country: "FR", city: "Paris" })).toBe(
      "medium",
    );
  });

  it("region only → low", () => {
    expect(
      queryUpperBoundConfidence({ country: "FR", region: "Lorraine" }),
    ).toBe("low");
  });

  it("nothing → none", () => {
    expect(queryUpperBoundConfidence({ country: "FR" })).toBe("none");
  });
});
