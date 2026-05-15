/**
 * Integration tests for /api/alerts.
 * Skipped without TEST_DATABASE_URL.
 */
import { it, expect } from "vitest";
import {
  describeIntegration,
  getTestPrisma,
  withIntegrationDb,
} from "../helpers/test-db";
import { invoke, makeRequest } from "../helpers/request";
import { GET as alertsGet, POST as alertsPost } from "@/app/api/alerts/route";
import { PATCH as alertPatch } from "@/app/api/alerts/[id]/route";

describeIntegration("/api/alerts", () => {
  withIntegrationDb();

  async function makeUser(role: "admin" | "user" = "user") {
    return getTestPrisma().user.create({
      data: { email: `u-${Math.random()}@test.local`, role },
    });
  }

  it("GET requires auth", async () => {
    const req = makeRequest("GET", "/api/alerts");
    const { status } = await invoke(alertsGet, req);
    expect(status).toBe(401);
  });

  it("GET returns only the calling user's alerts", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    await getTestPrisma().alert.createMany({
      data: [
        {
          userId: userA.id,
          name: "A1",
          criteria: { eventTypes: ["new_match"] } as never,
        },
        {
          userId: userB.id,
          name: "B1",
          criteria: { eventTypes: ["new_match"] } as never,
        },
      ],
    });
    const req = makeRequest("GET", "/api/alerts", { userId: userA.id });
    const { status, body } = await invoke<{ data: { name: string }[] }>(
      alertsGet,
      req,
    );
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.name).toBe("A1");
  });

  it("POST creates an alert with eventTypes default", async () => {
    const user = await makeUser();
    const req = makeRequest("POST", "/api/alerts", {
      userId: user.id,
      body: {
        name: "Watermolens FR",
        channel: "in_app",
        frequency: "instant",
        criteria: { country: ["FR"], maxPriceEur: 200_000 },
      },
    });
    const { status, body } = await invoke<{ id: string; criteria: { eventTypes: string[] } }>(
      alertsPost,
      req,
    );
    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.criteria.eventTypes).toEqual(["new_match"]);
  });

  it("POST rejects invalid criteria with 400", async () => {
    const user = await makeUser();
    const req = makeRequest("POST", "/api/alerts", {
      userId: user.id,
      body: {
        name: "Bad",
        channel: "in_app",
        criteria: {
          maxPriceEur: -100, // invalid
          minLandM2: "not-a-number",
        },
      },
    });
    const { status, body } = await invoke<{ error: { code: string } }>(
      alertsPost,
      req,
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("validation_failed");
  });

  it("PATCH updates an alert that belongs to the user", async () => {
    const user = await makeUser();
    const alert = await getTestPrisma().alert.create({
      data: {
        userId: user.id,
        name: "Old",
        criteria: { eventTypes: ["new_match"] } as never,
      },
    });
    const req = makeRequest("PATCH", `/api/alerts/${alert.id}`, {
      userId: user.id,
      body: { name: "New name", enabled: false },
    });
    const { status, body } = await invoke<{ name: string; enabled: boolean }>(
      alertPatch,
      req,
      { id: alert.id },
    );
    expect(status).toBe(200);
    expect(body.name).toBe("New name");
    expect(body.enabled).toBe(false);
  });

  it("PATCH refuses to update someone else's alert (returns 404)", async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const alert = await getTestPrisma().alert.create({
      data: {
        userId: owner.id,
        name: "Mine",
        criteria: { eventTypes: ["new_match"] } as never,
      },
    });
    const req = makeRequest("PATCH", `/api/alerts/${alert.id}`, {
      userId: intruder.id,
      body: { name: "Hijacked" },
    });
    const { status } = await invoke(alertPatch, req, { id: alert.id });
    expect(status).toBe(404);
  });

  it("POST accepts the brief's price_drop criterion", async () => {
    const user = await makeUser();
    const req = makeRequest("POST", "/api/alerts", {
      userId: user.id,
      body: {
        name: "Prijsdalingen",
        channel: "in_app",
        frequency: "instant",
        criteria: {
          eventTypes: ["price_drop"],
          minPriceDropPercent: 10,
          maxPriceEur: 250_000,
        },
      },
    });
    const { status, body } = await invoke<{
      criteria: { eventTypes: string[]; minPriceDropPercent: number };
    }>(alertsPost, req);
    expect(status).toBe(201);
    expect(body.criteria.eventTypes).toEqual(["price_drop"]);
    expect(body.criteria.minPriceDropPercent).toBe(10);
  });

  it("GET filters by enabled=true", async () => {
    const user = await makeUser();
    await getTestPrisma().alert.createMany({
      data: [
        {
          userId: user.id,
          name: "On",
          enabled: true,
          criteria: { eventTypes: ["new_match"] } as never,
        },
        {
          userId: user.id,
          name: "Off",
          enabled: false,
          criteria: { eventTypes: ["new_match"] } as never,
        },
      ],
    });
    const req = makeRequest("GET", "/api/alerts?enabled=true", {
      userId: user.id,
    });
    const { body } = await invoke<{ data: { name: string }[] }>(alertsGet, req);
    expect(body.data.map((a) => a.name)).toEqual(["On"]);
  });
});
