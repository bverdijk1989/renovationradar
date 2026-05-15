/**
 * Integration tests for /api/notifications.
 * Skipped without TEST_DATABASE_URL.
 */
import { it, expect } from "vitest";
import {
  describeIntegration,
  getTestPrisma,
  withIntegrationDb,
} from "../helpers/test-db";
import { invoke, makeRequest } from "../helpers/request";
import { GET as notificationsGet } from "@/app/api/notifications/route";
import { POST as ackNotification } from "@/app/api/notifications/[id]/acknowledge/route";

describeIntegration("/api/notifications", () => {
  withIntegrationDb();

  async function makeUserWithNotification(over: Record<string, unknown> = {}) {
    const prisma = getTestPrisma();
    const user = await prisma.user.create({
      data: { email: `u-${Math.random()}@test.local`, role: "user" },
    });
    const source = await prisma.source.create({
      data: {
        name: `Manual ${Math.random()}`,
        country: "FR",
        website: "internal://manual",
        sourceType: "manual",
        collectionMethods: ["manual_entry"],
        status: "active",
        legalStatus: "green",
      },
    });
    const listing = await prisma.normalizedListing.create({
      data: {
        sourceId: source.id,
        originalUrl: `internal://test/${Math.random()}`,
        titleOriginal: "Test",
        language: "fr",
        country: "FR",
        isDetached: "yes",
        fingerprint: `fp-${Math.random()}`,
      },
    });
    const alert = await prisma.alert.create({
      data: {
        userId: user.id,
        name: "Test alert",
        criteria: { eventTypes: ["new_match"] } as never,
      },
    });
    const notification = await prisma.alertNotification.create({
      data: {
        alertId: alert.id,
        normalizedListingId: listing.id,
        userId: user.id,
        eventType: "new_match",
        channel: "in_app",
        status: "dispatched",
        payload: { matchedReasons: ["test"] } as never,
        ...over,
      },
    });
    return { user, alert, listing, notification };
  }

  it("GET requires auth", async () => {
    const req = makeRequest("GET", "/api/notifications");
    const { status } = await invoke(notificationsGet, req);
    expect(status).toBe(401);
  });

  it("GET returns only the calling user's notifications", async () => {
    const { user: userA } = await makeUserWithNotification();
    await makeUserWithNotification(); // another user's notification

    const req = makeRequest("GET", "/api/notifications", { userId: userA.id });
    const { status, body } = await invoke<{
      data: Array<{ userId: string }>;
      count: number;
    }>(notificationsGet, req);
    expect(status).toBe(200);
    expect(body.count).toBe(1);
    expect(body.data[0]!.userId).toBe(userA.id);
  });

  it("GET filters by status=pending,dispatched", async () => {
    const { user } = await makeUserWithNotification({ status: "dispatched" });
    await makeUserWithNotification({ status: "acknowledged" });
    // Note: makeUserWithNotification makes a NEW user, so we override that.
    // Create a second notification for the same user directly.
    const prisma = getTestPrisma();
    const source = await prisma.source.findFirst();
    const listing = await prisma.normalizedListing.findFirst({
      where: { sourceId: source!.id },
    });
    const alert = await prisma.alert.findFirst({ where: { userId: user.id } });
    await prisma.alertNotification.create({
      data: {
        alertId: alert!.id,
        normalizedListingId: listing!.id,
        userId: user.id,
        eventType: "price_drop", // different event so the unique constraint passes
        channel: "in_app",
        status: "acknowledged",
        payload: {} as never,
      },
    });

    const req = makeRequest("GET", "/api/notifications?status=dispatched", {
      userId: user.id,
    });
    const { body } = await invoke<{
      data: Array<{ status: string }>;
    }>(notificationsGet, req);
    expect(body.data.every((n) => n.status === "dispatched")).toBe(true);
  });

  it("acknowledge marks the notification as read", async () => {
    const { user, notification } = await makeUserWithNotification();
    const req = makeRequest(
      "POST",
      `/api/notifications/${notification.id}/acknowledge`,
      { userId: user.id, body: {} },
    );
    const { status, body } = await invoke<{
      status: string;
      acknowledgedAt: string;
    }>(ackNotification, req, { id: notification.id });
    expect(status).toBe(200);
    expect(body.status).toBe("acknowledged");
    expect(body.acknowledgedAt).toBeTruthy();
  });

  it("acknowledge refuses to mark someone else's notification (404)", async () => {
    const { notification } = await makeUserWithNotification();
    const intruder = await getTestPrisma().user.create({
      data: { email: `intruder-${Math.random()}@test.local`, role: "user" },
    });
    const req = makeRequest(
      "POST",
      `/api/notifications/${notification.id}/acknowledge`,
      { userId: intruder.id, body: {} },
    );
    const { status } = await invoke(ackNotification, req, {
      id: notification.id,
    });
    expect(status).toBe(404);
  });
});
