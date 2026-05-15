/**
 * Integration tests for POST /api/discovery/run.
 *
 * The Discovery Engine fetches URLs (robots.txt + the candidate page) via
 * a real FetchTransport. To keep these tests deterministic and offline we
 * stub global fetch — the engine itself isn't injected with a transport
 * by the route handler.
 *
 * Skipped without TEST_DATABASE_URL.
 */
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  describeIntegration,
  getTestPrisma,
  withIntegrationDb,
} from "../helpers/test-db";
import { invoke, makeRequest } from "../helpers/request";
import { POST as discoveryRun } from "@/app/api/discovery/run/route";

// ---------------------------------------------------------------------------
// Global fetch stub for the duration of each test
// ---------------------------------------------------------------------------

type FixtureMap = Record<string, { status?: number; body: string }>;

function installFetchStub(fixtures: FixtureMap) {
  const stub = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const fixture = fixtures[url];
    if (!fixture) {
      return new Response("not mocked", { status: 404 });
    }
    return new Response(fixture.body, {
      status: fixture.status ?? 200,
      headers: { "content-type": "text/html" },
    });
  });
  vi.stubGlobal("fetch", stub);
  return stub;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const AGENCY_HTML = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <title>Agence du Vieux Moulin</title>
  <meta property="og:site_name" content="Agence du Vieux Moulin">
</head>
<body>
  <h1>Agence immobilière à Bar-le-Duc</h1>
  <a href="mailto:contact@vieuxmoulin.fr">Contact</a>
</body>
</html>`;

describeIntegration("/api/discovery/run", () => {
  withIntegrationDb();

  async function makeAdmin() {
    return getTestPrisma().user.create({
      data: { email: `admin-${Math.random()}@test.local`, role: "admin" },
    });
  }

  it("requires admin auth (401 without, 403 as user)", async () => {
    const anon = makeRequest("POST", "/api/discovery/run", {
      body: { country: "FR", language: "fr", provider: "manual_import", providerInput: { urls: [] } },
    });
    const r1 = await invoke(discoveryRun, anon);
    expect(r1.status).toBe(401);

    const user = await getTestPrisma().user.create({
      data: { email: `u-${Math.random()}@test.local`, role: "user" },
    });
    const userReq = makeRequest("POST", "/api/discovery/run", {
      userId: user.id,
      body: { country: "FR", language: "fr", provider: "manual_import", providerInput: { urls: [] } },
    });
    const r2 = await invoke(discoveryRun, userReq);
    expect(r2.status).toBe(403);
  });

  it("validates body — empty URLs results in 0 candidates", async () => {
    const admin = await makeAdmin();
    installFetchStub({});
    const req = makeRequest("POST", "/api/discovery/run", {
      userId: admin.id,
      body: {
        country: "FR",
        language: "fr",
        provider: "manual_import",
        providerInput: { urls: [] },
      },
    });
    const { status, body } = await invoke<{
      candidatesFetched: number;
      candidatesPersisted: number;
    }>(discoveryRun, req);
    expect(status).toBe(200);
    expect(body.candidatesFetched).toBe(0);
    expect(body.candidatesPersisted).toBe(0);
  });

  it("happy path persists a pending Source with classification=real_estate_agency", async () => {
    const admin = await makeAdmin();
    installFetchStub({
      "https://vieuxmoulin.fr/robots.txt": { body: "User-agent: *\nAllow: /\n" },
      "https://vieuxmoulin.fr/": { body: AGENCY_HTML },
    });
    const req = makeRequest("POST", "/api/discovery/run", {
      userId: admin.id,
      body: {
        country: "FR",
        language: "fr",
        region: "Lorraine",
        provider: "manual_import",
        providerInput: { urls: ["https://vieuxmoulin.fr/"] },
      },
    });
    const { status, body } = await invoke<{
      candidatesPersisted: number;
      candidates: Array<{ classification: string; skipped: false | string }>;
    }>(discoveryRun, req);
    expect(status).toBe(200);
    expect(body.candidatesPersisted).toBe(1);
    expect(body.candidates[0]!.classification).toBe("real_estate_agency");

    // Verify Source row is pending_review — NEVER auto-active.
    const sources = await getTestPrisma().source.findMany({
      where: { website: "https://vieuxmoulin.fr/" },
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]!.status).toBe("pending_review");
    expect(sources[0]!.legalStatus).toBe("pending_review");
    expect(sources[0]!.classification).toBe("real_estate_agency");

    // A SourceReview row was written with evidenceUrl set.
    const reviews = await getTestPrisma().sourceReview.findMany({
      where: { sourceId: sources[0]!.id },
    });
    expect(reviews).toHaveLength(1);
    expect(reviews[0]!.evidenceUrl).toBe("https://vieuxmoulin.fr/");
  });

  it("robots.txt Disallow → source persisted as classification=unknown, NO page fetch", async () => {
    const admin = await makeAdmin();
    let pageFetched = false;
    const stub = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow: /\n", { status: 200 });
      }
      pageFetched = true;
      return new Response(AGENCY_HTML, { status: 200 });
    });
    vi.stubGlobal("fetch", stub);

    const req = makeRequest("POST", "/api/discovery/run", {
      userId: admin.id,
      body: {
        country: "FR",
        language: "fr",
        provider: "manual_import",
        providerInput: { urls: ["https://blocked.example/"] },
      },
    });
    const { body } = await invoke<{
      reasons: { robots_blocked: number };
      candidates: Array<{ classification: string }>;
    }>(discoveryRun, req);

    expect(body.reasons.robots_blocked).toBe(1);
    expect(body.candidates[0]!.classification).toBe("unknown");
    expect(pageFetched).toBe(false); // engine respected robots.txt
  });

  it("duplicate URL (already in DB) counted as skipped_existing", async () => {
    const admin = await makeAdmin();
    await getTestPrisma().source.create({
      data: {
        name: "Already there",
        country: "FR",
        website: "https://existing.fr/",
        sourceType: "scrape",
        collectionMethods: ["scrape_with_permission"],
        status: "pending_review",
        legalStatus: "pending_review",
        classification: "real_estate_agency",
      },
    });
    installFetchStub({
      "https://existing.fr/robots.txt": { body: "" },
      "https://existing.fr/": { body: AGENCY_HTML },
    });
    const req = makeRequest("POST", "/api/discovery/run", {
      userId: admin.id,
      body: {
        country: "FR",
        language: "fr",
        provider: "manual_import",
        providerInput: { urls: ["https://existing.fr/"] },
      },
    });
    const { body } = await invoke<{
      candidatesPersisted: number;
      reasons: { skipped_existing: number };
    }>(discoveryRun, req);
    expect(body.candidatesPersisted).toBe(0);
    expect(body.reasons.skipped_existing).toBe(1);
  });

  it("AuditLog records the run (entityType=source, action=discovery_run)", async () => {
    const admin = await makeAdmin();
    installFetchStub({});
    const req = makeRequest("POST", "/api/discovery/run", {
      userId: admin.id,
      body: {
        country: "FR",
        language: "fr",
        provider: "manual_import",
        providerInput: { urls: [] },
      },
    });
    await invoke(discoveryRun, req);
    const logs = await getTestPrisma().auditLog.findMany({
      where: { userId: admin.id, action: "discovery_run" },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
