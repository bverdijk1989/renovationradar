import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    alertNotification: { update: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { Dispatcher } from "./delivery/dispatcher";
import { InAppChannelHandler } from "./delivery/in-app";
import { EmailChannelHandler } from "./delivery/email";
import { WebhookChannelHandler } from "./delivery/webhook";
import type { DeliverableNotification, ChannelHandler } from "./types";

function nFixture(over: Partial<DeliverableNotification> = {}): DeliverableNotification {
  return {
    id: "n1",
    alertId: "a1",
    alertName: "Test",
    userId: "u1",
    channel: "in_app",
    eventType: "new_match",
    payload: {},
    listing: {
      id: "l1",
      titleNl: "Watermolen",
      titleOriginal: "Watermolen",
      originalUrl: "https://x",
      priceEur: 175_000,
      country: "DE",
      city: "Brilon",
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Dispatcher — channel routing", () => {
  it("in_app channel marks the row as dispatched", async () => {
    mockPrisma.alertNotification.update.mockResolvedValue({});
    const d = new Dispatcher();
    const r = await d.dispatch(nFixture({ channel: "in_app" }));
    expect(r.ok).toBe(true);
    expect(mockPrisma.alertNotification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "n1" },
        data: expect.objectContaining({ status: "dispatched" }),
      }),
    );
  });

  it("email placeholder fails gracefully with reason", async () => {
    mockPrisma.alertNotification.update.mockResolvedValue({});
    const d = new Dispatcher();
    const r = await d.dispatch(nFixture({ channel: "email" }));
    expect(r.ok).toBe(false);
    const args = mockPrisma.alertNotification.update.mock.calls[0]![0];
    expect(args.data.status).toBe("failed");
    expect(args.data.failureReason).toMatch(/placeholder/i);
  });

  it("webhook placeholder fails gracefully", async () => {
    mockPrisma.alertNotification.update.mockResolvedValue({});
    const d = new Dispatcher();
    const r = await d.dispatch(nFixture({ channel: "webhook" }));
    expect(r.ok).toBe(false);
    expect(
      mockPrisma.alertNotification.update.mock.calls[0]![0].data.failureReason,
    ).toMatch(/HMAC|placeholder/i);
  });

  it("unknown channel → handler-not-found failure", async () => {
    mockPrisma.alertNotification.update.mockResolvedValue({});
    // Custom dispatcher with only in_app registered.
    const d = new Dispatcher([new InAppChannelHandler()]);
    const r = await d.dispatch(nFixture({ channel: "webhook" }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_handler");
  });

  it("handler throwing is caught and marked failed", async () => {
    mockPrisma.alertNotification.update.mockResolvedValue({});
    const angryHandler: ChannelHandler = {
      channel: "in_app",
      async deliver() {
        throw new Error("disk full");
      },
    };
    const d = new Dispatcher([angryHandler]);
    const r = await d.dispatch(nFixture({ channel: "in_app" }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/disk full/);
  });

  it("dispatchPending drains all pending rows", async () => {
    mockPrisma.alertNotification.findMany.mockResolvedValue([
      {
        id: "n1",
        alertId: "a1",
        userId: "u1",
        channel: "in_app",
        eventType: "new_match",
        payload: {},
        alert: { name: "T" },
        listing: {
          id: "l1",
          titleNl: "X",
          titleOriginal: "X",
          originalUrl: "https://x",
          priceEur: 100_000,
          country: "FR",
          city: "Paris",
        },
      },
      {
        id: "n2",
        alertId: "a2",
        userId: "u2",
        channel: "email", // will fail (placeholder)
        eventType: "new_match",
        payload: {},
        alert: { name: "T2" },
        listing: {
          id: "l2",
          titleNl: "Y",
          titleOriginal: "Y",
          originalUrl: "https://y",
          priceEur: 100_000,
          country: "FR",
          city: "Lyon",
        },
      },
    ]);
    mockPrisma.alertNotification.update.mockResolvedValue({});
    const d = new Dispatcher();
    const out = await d.dispatchPending();
    expect(out.total).toBe(2);
    expect(out.dispatched).toBe(1);
    expect(out.failed).toBe(1);
  });
});

describe("delivery handlers (unit)", () => {
  it("InAppChannelHandler always returns ok", async () => {
    const h = new InAppChannelHandler();
    expect((await h.deliver(nFixture())).ok).toBe(true);
  });

  it("EmailChannelHandler returns ok:false with placeholder reason", async () => {
    const h = new EmailChannelHandler();
    const r = await h.deliver(nFixture());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/placeholder/i);
  });

  it("WebhookChannelHandler returns ok:false with placeholder reason", async () => {
    const h = new WebhookChannelHandler();
    const r = await h.deliver(nFixture());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/placeholder/i);
  });
});
