/**
 * Integration tests for the /api/sources route family.
 *
 * Skipped automatically if TEST_DATABASE_URL is not set. To run:
 *
 *   $env:TEST_DATABASE_URL = "postgresql://radar:radar@localhost:5432/renovation_radar_test"
 *   pnpm test
 */
import { it, expect } from "vitest";
import {
  describeIntegration,
  getTestPrisma,
  withIntegrationDb,
} from "../helpers/test-db";
import { invoke, makeRequest } from "../helpers/request";
import { GET as sourcesGet, POST as sourcesPost } from "@/app/api/sources/route";
import {
  GET as sourceGet,
  PATCH as sourcePatch,
} from "@/app/api/sources/[id]/route";
import { POST as sourceCheck } from "@/app/api/sources/[id]/check/route";
import { POST as sourceActivate } from "@/app/api/sources/[id]/activate/route";
import { POST as sourceDeactivate } from "@/app/api/sources/[id]/deactivate/route";

describeIntegration("/api/sources", () => {
  withIntegrationDb();

  async function makeAdmin(): Promise<string> {
    const u = await getTestPrisma().user.create({
      data: { email: "admin@test.local", role: "admin" },
    });
    return u.id;
  }

  it("POST /api/sources creates source as pending_review", async () => {
    const adminId = await makeAdmin();
    const req = makeRequest("POST", "/api/sources", {
      userId: adminId,
      body: {
        name: "Test RSS",
        country: "FR",
        website: "https://example.com/feed",
        sourceType: "rss",
        collectionMethods: ["rss"],
      },
    });
    const { status, body } = await invoke<{ status: string; legalStatus: string }>(
      sourcesPost,
      req,
    );
    expect(status).toBe(201);
    expect(body.status).toBe("pending_review");
    expect(body.legalStatus).toBe("pending_review");
  });

  it("POST /api/sources without admin role is forbidden", async () => {
    const u = await getTestPrisma().user.create({
      data: { email: "u@test.local", role: "user" },
    });
    const req = makeRequest("POST", "/api/sources", {
      userId: u.id,
      body: {
        name: "Test",
        country: "FR",
        website: "https://example.com",
        sourceType: "rss",
        collectionMethods: ["rss"],
      },
    });
    const { status } = await invoke(sourcesPost, req);
    expect(status).toBe(403);
  });

  it("POST /api/sources without auth returns 401", async () => {
    const req = makeRequest("POST", "/api/sources", {
      body: {
        name: "Test",
        country: "FR",
        website: "https://example.com",
        sourceType: "rss",
        collectionMethods: ["rss"],
      },
    });
    const { status } = await invoke(sourcesPost, req);
    expect(status).toBe(401);
  });

  it("POST /api/sources with bad payload returns 400 with field errors", async () => {
    const adminId = await makeAdmin();
    const req = makeRequest("POST", "/api/sources", {
      userId: adminId,
      body: { name: "", country: "ZZ", website: "not-a-url" },
    });
    const { status, body } = await invoke<{ error: { code: string; details: unknown } }>(
      sourcesPost,
      req,
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("validation_failed");
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it("GET /api/sources/:id returns the row + review history", async () => {
    const adminId = await makeAdmin();
    const created = await getTestPrisma().source.create({
      data: {
        name: "S",
        country: "FR",
        website: "https://example.com",
        sourceType: "rss",
        collectionMethods: ["rss"],
        status: "pending_review",
        legalStatus: "pending_review",
      },
    });
    const req = makeRequest("GET", `/api/sources/${created.id}`, { userId: adminId });
    const { status, body } = await invoke<{ id: string; reviews: unknown[] }>(
      sourceGet,
      req,
      { id: created.id },
    );
    expect(status).toBe(200);
    expect(body.id).toBe(created.id);
    expect(Array.isArray(body.reviews)).toBe(true);
  });

  it("POST /api/sources/:id/check creates a SourceReview row", async () => {
    const adminId = await makeAdmin();
    const created = await getTestPrisma().source.create({
      data: {
        name: "S",
        country: "FR",
        website: "https://example.com",
        sourceType: "rss",
        collectionMethods: ["rss"],
        status: "pending_review",
        legalStatus: "pending_review",
      },
    });

    const req = makeRequest("POST", `/api/sources/${created.id}/check`, {
      userId: adminId,
      body: {
        robotsStatus: "allows",
        termsStatus: "allows",
        legalStatus: "green",
        notes: "ToS reviewed",
      },
    });
    const { status, body } = await invoke<{ legalStatus: string }>(
      sourceCheck,
      req,
      { id: created.id },
    );
    expect(status).toBe(200);
    expect(body.legalStatus).toBe("green");

    const reviews = await getTestPrisma().sourceReview.findMany({
      where: { sourceId: created.id },
    });
    expect(reviews).toHaveLength(1);
    expect(reviews[0]!.legalStatusAfter).toBe("green");
  });

  it("POST /api/sources/:id/activate refuses when legalStatus is not green", async () => {
    const adminId = await makeAdmin();
    const created = await getTestPrisma().source.create({
      data: {
        name: "S",
        country: "FR",
        website: "https://example.com",
        sourceType: "rss",
        collectionMethods: ["rss"],
        status: "pending_review",
        legalStatus: "pending_review",
      },
    });
    const req = makeRequest("POST", `/api/sources/${created.id}/activate`, {
      userId: adminId,
    });
    const { status, body } = await invoke<{ error: { code: string } }>(
      sourceActivate,
      req,
      { id: created.id },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("bad_request");
  });

  it("full lifecycle: create → check (green) → activate → deactivate", async () => {
    const adminId = await makeAdmin();
    // Create
    const createReq = makeRequest("POST", "/api/sources", {
      userId: adminId,
      body: {
        name: "Lifecycle test",
        country: "DE",
        website: "https://example.de",
        sourceType: "api",
        collectionMethods: ["api"],
      },
    });
    const { body: created } = await invoke<{ id: string }>(sourcesPost, createReq);

    // Check → green
    const checkReq = makeRequest("POST", `/api/sources/${created.id}/check`, {
      userId: adminId,
      body: {
        robotsStatus: "allows",
        termsStatus: "allows",
        legalStatus: "green",
      },
    });
    await invoke(sourceCheck, checkReq, { id: created.id });

    // Activate
    const actReq = makeRequest("POST", `/api/sources/${created.id}/activate`, {
      userId: adminId,
    });
    const { status: aStatus, body: activated } = await invoke<{ status: string }>(
      sourceActivate,
      actReq,
      { id: created.id },
    );
    expect(aStatus).toBe(200);
    expect(activated.status).toBe("active");

    // Deactivate
    const deactReq = makeRequest("POST", `/api/sources/${created.id}/deactivate`, {
      userId: adminId,
    });
    const { body: deactivated } = await invoke<{ status: string }>(
      sourceDeactivate,
      deactReq,
      { id: created.id },
    );
    expect(deactivated.status).toBe("paused");
  });

  it("PATCH cannot bypass the green-gate to activate", async () => {
    const adminId = await makeAdmin();
    const created = await getTestPrisma().source.create({
      data: {
        name: "S",
        country: "FR",
        website: "https://example.com",
        sourceType: "rss",
        collectionMethods: ["rss"],
        status: "pending_review",
        legalStatus: "amber",
      },
    });
    const req = makeRequest("PATCH", `/api/sources/${created.id}`, {
      userId: adminId,
      body: { status: "active" },
    });
    const { status, body } = await invoke<{ error: { code: string } }>(
      sourcePatch,
      req,
      { id: created.id },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("bad_request");
  });

  it("GET /api/sources supports country filter + pagination", async () => {
    const db = getTestPrisma();
    await db.source.createMany({
      data: [
        {
          name: "S-FR-1",
          country: "FR",
          website: "https://a.fr",
          sourceType: "rss",
          collectionMethods: ["rss"],
          legalStatus: "pending_review",
          status: "pending_review",
        },
        {
          name: "S-DE-1",
          country: "DE",
          website: "https://a.de",
          sourceType: "rss",
          collectionMethods: ["rss"],
          legalStatus: "pending_review",
          status: "pending_review",
        },
      ],
    });
    const req = makeRequest("GET", "/api/sources?country=FR&pageSize=10");
    const { status, body } = await invoke<{
      data: Array<{ country: string }>;
      pagination: { total: number };
    }>(sourcesGet, req);
    expect(status).toBe(200);
    expect(body.data.every((s) => s.country === "FR")).toBe(true);
    expect(body.pagination.total).toBeGreaterThanOrEqual(1);
  });
});
