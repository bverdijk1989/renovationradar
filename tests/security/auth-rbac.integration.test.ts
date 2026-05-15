/**
 * Security: endpoint × role matrix.
 *
 * Every mutating endpoint MUST refuse with 401 (no auth) or 403 (auth but
 * wrong role). This file is the central source of truth for that matrix —
 * adding a new admin endpoint? Add a row here.
 *
 * Skipped without TEST_DATABASE_URL. Run via:
 *   $env:TEST_DATABASE_URL = "postgresql://radar:radar@localhost:5432/renovation_radar_test"
 *   pnpm test:integration
 */
import { it, expect } from "vitest";
import {
  describeIntegration,
  getTestPrisma,
  withIntegrationDb,
} from "../helpers/test-db";
import { invoke, makeRequest } from "../helpers/request";

import { POST as sourcesCreate } from "@/app/api/sources/route";
import { PATCH as sourcesPatch } from "@/app/api/sources/[id]/route";
import { POST as sourcesActivate } from "@/app/api/sources/[id]/activate/route";
import { POST as sourcesDeactivate } from "@/app/api/sources/[id]/deactivate/route";
import { POST as sourcesCheck } from "@/app/api/sources/[id]/check/route";
import { POST as listingsManual } from "@/app/api/listings/manual/route";
import { PATCH as listingsPatch } from "@/app/api/listings/[id]/route";
import { POST as listingsScore } from "@/app/api/listings/[id]/score/route";
import { POST as scoringRecalc } from "@/app/api/scoring/recalculate/route";
import { POST as searchProfilesCreate } from "@/app/api/search-profiles/route";
import { POST as runSearch } from "@/app/api/jobs/run-search/route";
import { POST as discoveryRun } from "@/app/api/discovery/run/route";
import { POST as digestRun } from "@/app/api/alerts/digest/run/route";
import { POST as dispatchPending } from "@/app/api/alerts/dispatch-pending/route";
import { POST as listingsSave } from "@/app/api/listings/[id]/save/route";
import { POST as listingsIgnore } from "@/app/api/listings/[id]/ignore/route";
import { POST as ackNotification } from "@/app/api/notifications/[id]/acknowledge/route";

// ---------------------------------------------------------------------------
// Endpoint × role matrix
// ---------------------------------------------------------------------------

type EndpointSpec = {
  name: string;
  handler: typeof sourcesCreate;
  params?: Record<string, string>;
  body?: unknown;
  requiredRole: "admin" | "user"; // who's allowed
};

const ADMIN_ENDPOINTS: EndpointSpec[] = [
  {
    name: "POST /api/sources",
    handler: sourcesCreate,
    body: {
      name: "x",
      country: "FR",
      website: "https://example.fr",
      sourceType: "rss",
      collectionMethods: ["rss"],
    },
    requiredRole: "admin",
  },
  {
    name: "PATCH /api/sources/:id",
    handler: sourcesPatch,
    params: { id: "00000000-0000-0000-0000-000000000001" },
    body: { name: "x" },
    requiredRole: "admin",
  },
  {
    name: "POST /api/sources/:id/activate",
    handler: sourcesActivate,
    params: { id: "00000000-0000-0000-0000-000000000001" },
    requiredRole: "admin",
  },
  {
    name: "POST /api/sources/:id/deactivate",
    handler: sourcesDeactivate,
    params: { id: "00000000-0000-0000-0000-000000000001" },
    requiredRole: "admin",
  },
  {
    name: "POST /api/sources/:id/check",
    handler: sourcesCheck,
    params: { id: "00000000-0000-0000-0000-000000000001" },
    body: {
      robotsStatus: "allows",
      termsStatus: "allows",
      legalStatus: "green",
    },
    requiredRole: "admin",
  },
  {
    name: "POST /api/listings/manual",
    handler: listingsManual,
    body: {
      sourceId: "00000000-0000-0000-0000-000000000001",
      originalUrl: "https://x.fr/a",
      titleOriginal: "X",
      language: "fr",
      country: "FR",
    },
    requiredRole: "admin",
  },
  {
    name: "PATCH /api/listings/:id",
    handler: listingsPatch,
    params: { id: "00000000-0000-0000-0000-000000000001" },
    body: { titleNl: "x" },
    requiredRole: "admin",
  },
  {
    name: "POST /api/listings/:id/score",
    handler: listingsScore,
    params: { id: "00000000-0000-0000-0000-000000000001" },
    requiredRole: "admin",
  },
  {
    name: "POST /api/scoring/recalculate",
    handler: scoringRecalc,
    body: {},
    requiredRole: "admin",
  },
  {
    name: "POST /api/search-profiles",
    handler: searchProfilesCreate,
    body: {
      name: "Test",
      country: "FR",
      language: "fr",
      category: "general",
      terms: ["test"],
    },
    requiredRole: "admin",
  },
  {
    name: "POST /api/jobs/run-search",
    handler: runSearch,
    body: { sourceId: "00000000-0000-0000-0000-000000000001" },
    requiredRole: "admin",
  },
  {
    name: "POST /api/discovery/run",
    handler: discoveryRun,
    body: {
      country: "FR",
      language: "fr",
      provider: "manual_import",
      providerInput: { urls: [] },
    },
    requiredRole: "admin",
  },
  {
    name: "POST /api/alerts/digest/run",
    handler: digestRun,
    body: { frequency: "daily" },
    requiredRole: "admin",
  },
  {
    name: "POST /api/alerts/dispatch-pending",
    handler: dispatchPending,
    body: {},
    requiredRole: "admin",
  },
];

const USER_ENDPOINTS: EndpointSpec[] = [
  {
    name: "POST /api/listings/:id/save",
    handler: listingsSave,
    params: { id: "00000000-0000-0000-0000-000000000001" },
    body: {},
    requiredRole: "user",
  },
  {
    name: "POST /api/listings/:id/ignore",
    handler: listingsIgnore,
    params: { id: "00000000-0000-0000-0000-000000000001" },
    body: {},
    requiredRole: "user",
  },
  {
    name: "POST /api/notifications/:id/acknowledge",
    handler: ackNotification,
    params: { id: "00000000-0000-0000-0000-000000000001" },
    body: {},
    requiredRole: "user",
  },
];

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describeIntegration("Security: auth + RBAC matrix", () => {
  withIntegrationDb();

  // ----- 401: no auth at all ------------------------------------------------

  for (const ep of [...ADMIN_ENDPOINTS, ...USER_ENDPOINTS]) {
    it(`${ep.name} → 401 without auth`, async () => {
      const req = makeRequest("POST", "/test", {
        body: ep.body,
      });
      // PATCH endpoints use different methods; the helpers don't care, the
      // handler does. We just need to verify the auth gate fires before
      // any other logic, so 401 is the expected status regardless of body.
      const { status } = await invoke(ep.handler as never, req, ep.params ?? {});
      expect(status).toBe(401);
    });
  }

  // ----- 403: authed as wrong role -----------------------------------------

  for (const ep of ADMIN_ENDPOINTS) {
    it(`${ep.name} → 403 when role=user`, async () => {
      const user = await getTestPrisma().user.create({
        data: { email: `u-${Math.random()}@test.local`, role: "user" },
      });
      const req = makeRequest("POST", "/test", {
        userId: user.id,
        body: ep.body,
      });
      const { status } = await invoke(ep.handler as never, req, ep.params ?? {});
      expect(status).toBe(403);
    });
  }

  // ----- Sanity: admin gets through the auth gate --------------------------
  // We don't assert success (it may still 400/404 due to missing fixture),
  // only that the AUTH gate let it through (i.e. status != 401 && != 403).

  for (const ep of ADMIN_ENDPOINTS) {
    it(`${ep.name} → auth gate accepts admin role`, async () => {
      const admin = await getTestPrisma().user.create({
        data: { email: `admin-${Math.random()}@test.local`, role: "admin" },
      });
      const req = makeRequest("POST", "/test", {
        userId: admin.id,
        body: ep.body,
      });
      const { status } = await invoke(ep.handler as never, req, ep.params ?? {});
      expect(status).not.toBe(401);
      expect(status).not.toBe(403);
    });
  }

  // ----- Header tampering / production-bypass disabled ---------------------

  it("dev header is ignored when NODE_ENV=production and DEV_AUTH_BYPASS not set", async () => {
    const original = process.env.NODE_ENV;
    const originalBypass = process.env.DEV_AUTH_BYPASS;
    try {
      // @ts-expect-error — readonly in @types/node, but writable at runtime
      process.env.NODE_ENV = "production";
      delete process.env.DEV_AUTH_BYPASS;

      const admin = await getTestPrisma().user.create({
        data: { email: `a-${Math.random()}@test.local`, role: "admin" },
      });
      const req = makeRequest("POST", "/api/sources", {
        userId: admin.id,
        body: {
          name: "x",
          country: "FR",
          website: "https://x.fr",
          sourceType: "rss",
          collectionMethods: ["rss"],
        },
      });
      const { status } = await invoke(sourcesCreate, req);
      // The dev header is rejected → 401.
      expect(status).toBe(401);
    } finally {
      // @ts-expect-error — restore
      process.env.NODE_ENV = original;
      if (originalBypass !== undefined) {
        process.env.DEV_AUTH_BYPASS = originalBypass;
      }
    }
  });
});
