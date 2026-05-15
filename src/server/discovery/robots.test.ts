import { describe, it, expect } from "vitest";
import { decide, checkRobots } from "./robots";
import { MockTransport } from "@/server/connectors";

describe("robots decide() — pure", () => {
  it("no robots.txt content → allowed (no matching group)", () => {
    expect(decide("", "RenovationRadar", "/about").allowed).toBe(true);
  });

  it("Disallow: / on '*' blocks every path", () => {
    const body = `User-agent: *\nDisallow: /\n`;
    const r = decide(body, "RenovationRadar", "/about");
    expect(r.allowed).toBe(false);
    expect(r.evidence).toMatch(/Disallow/);
  });

  it("Disallow: /private blocks /private/* only", () => {
    const body = `User-agent: *\nDisallow: /private\n`;
    expect(decide(body, "Any", "/public").allowed).toBe(true);
    expect(decide(body, "Any", "/private/secret").allowed).toBe(false);
  });

  it("specific User-agent group overrides '*'", () => {
    const body = `
User-agent: *
Disallow: /

User-agent: RenovationRadar
Disallow:
`.trim();
    // For RenovationRadar, empty Disallow → no rule → allowed.
    expect(decide(body, "RenovationRadar", "/anything").allowed).toBe(true);
    // For everyone else, '*' Disallow: / blocks.
    expect(decide(body, "Other", "/anything").allowed).toBe(false);
  });

  it("longest match wins (Allow beats Disallow)", () => {
    const body = `
User-agent: *
Disallow: /admin
Allow: /admin/public
`.trim();
    expect(decide(body, "Any", "/admin/public/x").allowed).toBe(true);
    expect(decide(body, "Any", "/admin/private").allowed).toBe(false);
  });

  it("groups separated by blank lines are tracked independently", () => {
    const body = `
User-agent: *
Disallow: /shop

User-agent: GoodBot
Disallow: /

User-agent: NicheBot
Disallow:
`.trim();
    expect(decide(body, "GoodBot", "/whatever").allowed).toBe(false);
    expect(decide(body, "NicheBot", "/whatever").allowed).toBe(true);
    expect(decide(body, "Random", "/shop/x").allowed).toBe(false);
    expect(decide(body, "Random", "/about").allowed).toBe(true);
  });
});

describe("checkRobots — via transport", () => {
  it("missing robots.txt (HTTP 404) → allowed", async () => {
    const transport = new MockTransport((url) => {
      if (url.endsWith("/robots.txt")) {
        // Simulate 404 by mapping the mock to a function that throws.
        throw new Error("HTTP 404 fetching " + url);
      }
      return { body: "" };
    });
    const r = await checkRobots("https://example.com/agence", "RenovationRadar", transport);
    expect(r.allowed).toBe(true);
    expect(r.evidence).toMatch(/standaard toegestaan/);
  });

  it("returns the parsed decision when robots.txt exists", async () => {
    const transport = new MockTransport({
      "https://example.com/robots.txt": {
        body: "User-agent: *\nDisallow: /admin\n",
      },
    });
    const allowed = await checkRobots("https://example.com/agence", "RR", transport);
    expect(allowed.allowed).toBe(true);
    const blocked = await checkRobots("https://example.com/admin/x", "RR", transport);
    expect(blocked.allowed).toBe(false);
  });

  it("fail-closed on transport error other than 404", async () => {
    const transport = new MockTransport(() => {
      throw new Error("network refused");
    });
    const r = await checkRobots("https://example.com/x", "RR", transport);
    expect(r.allowed).toBe(false);
    expect(r.evidence).toMatch(/fail closed/);
  });
});
