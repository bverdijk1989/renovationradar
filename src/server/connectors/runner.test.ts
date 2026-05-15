import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma, type Source } from "@prisma/client";

// ---------------------------------------------------------------------------
// Mock Prisma BEFORE importing the runner.
// ---------------------------------------------------------------------------
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    crawlJob: { findUnique: vi.fn(), update: vi.fn() },
    rawListing: { create: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { runConnectorJob } from "./runner";
import { MockTransport } from "./transport";
import { NoopRateLimiter } from "./rate-limit";
import type { SourceConnector } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function source(over: Partial<Source> = {}): Source {
  return {
    id: "src-1",
    name: "Test source",
    country: "FR",
    website: "https://example.com",
    sourceType: "rss",
    collectionMethods: ["rss"],
    status: "active",
    robotsStatus: "allows",
    termsStatus: "allows",
    legalStatus: "green",
    lastCheckedAt: null,
    notes: null,
    connectorConfig: { feedUrl: "https://example.com/feed.xml" } as never,
    rateLimitPerMinute: null,
    userAgent: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Source;
}

function jobWith(sourceRow: Source, status: string = "queued") {
  return {
    id: "job-1",
    sourceId: sourceRow.id,
    searchProfileId: null,
    status,
    startedAt: null,
    finishedAt: null,
    itemsFetched: 0,
    itemsAccepted: 0,
    itemsRejected: 0,
    errorMessage: null,
    meta: null,
    createdAt: new Date(),
    source: sourceRow,
    searchProfile: null,
  };
}

function fakeConnector(over: Partial<SourceConnector> = {}): SourceConnector {
  return {
    name: "fake-v1",
    sourceType: "rss",
    canHandle: () => true,
    validateSource: async () => ({ ok: true, issues: [], warnings: [] }),
    fetchListings: async () => [
      { externalId: "ext-1", url: "https://x/1", payload: { title: "hello" } },
      { externalId: "ext-2", url: "https://x/2", payload: { title: "world" } },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Legal gate
// ---------------------------------------------------------------------------

describe("runConnectorJob — legal gate", () => {
  it("refuses to run when source.status != active", async () => {
    mockPrisma.crawlJob.findUnique.mockResolvedValue(
      jobWith(source({ status: "pending_review" })),
    );
    mockPrisma.crawlJob.update.mockResolvedValue({});
    const result = await runConnectorJob("job-1", {
      transport: new MockTransport({}),
      rateLimiter: new NoopRateLimiter(),
      connector: fakeConnector(),
    });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/legal_gate_blocked/);
    expect(mockPrisma.rawListing.create).not.toHaveBeenCalled();
    // Persisted a failed CrawlJob row.
    expect(mockPrisma.crawlJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
  });

  it("refuses to run when source.legalStatus != green", async () => {
    mockPrisma.crawlJob.findUnique.mockResolvedValue(
      jobWith(source({ legalStatus: "amber" })),
    );
    mockPrisma.crawlJob.update.mockResolvedValue({});
    const result = await runConnectorJob("job-1", {
      transport: new MockTransport({}),
      rateLimiter: new NoopRateLimiter(),
      connector: fakeConnector(),
    });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/legalStatus/);
  });

  it("refuses to crawl manual-only sources", async () => {
    mockPrisma.crawlJob.findUnique.mockResolvedValue(
      jobWith(source({ collectionMethods: ["manual_entry"], sourceType: "manual" })),
    );
    mockPrisma.crawlJob.update.mockResolvedValue({});
    const result = await runConnectorJob("job-1", {
      transport: new MockTransport({}),
      rateLimiter: new NoopRateLimiter(),
      connector: fakeConnector(),
    });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/manual-entry only/);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

describe("runConnectorJob — lifecycle", () => {
  it("queued → running → succeeded with counters", async () => {
    mockPrisma.crawlJob.findUnique.mockResolvedValue(jobWith(source()));
    mockPrisma.crawlJob.update.mockResolvedValue({});
    mockPrisma.rawListing.create.mockResolvedValue({ id: "r" });

    const result = await runConnectorJob("job-1", {
      transport: new MockTransport({}),
      rateLimiter: new NoopRateLimiter(),
      connector: fakeConnector(),
    });

    expect(result.ok).toBe(true);
    expect(result.itemsFetched).toBe(2);
    expect(result.itemsAccepted).toBe(2);
    expect(result.itemsRejected).toBe(0);
    // Two updates: running, then succeeded.
    const calls = mockPrisma.crawlJob.update.mock.calls;
    expect(calls[0]![0].data.status).toBe("running");
    expect(calls[1]![0].data).toMatchObject({
      status: "succeeded",
      itemsFetched: 2,
      itemsAccepted: 2,
      itemsRejected: 0,
    });
  });

  it("dedup: P2002 unique violation counts as rejected, not error", async () => {
    mockPrisma.crawlJob.findUnique.mockResolvedValue(jobWith(source()));
    mockPrisma.crawlJob.update.mockResolvedValue({});
    // First create succeeds, second throws unique violation.
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint",
      { code: "P2002", clientVersion: "test" },
    );
    mockPrisma.rawListing.create
      .mockResolvedValueOnce({ id: "r1" })
      .mockRejectedValueOnce(p2002);

    const result = await runConnectorJob("job-1", {
      transport: new MockTransport({}),
      rateLimiter: new NoopRateLimiter(),
      connector: fakeConnector(),
    });
    expect(result.ok).toBe(true);
    expect(result.itemsAccepted).toBe(1);
    expect(result.itemsRejected).toBe(1);
  });

  it("connector throwing during fetchListings → job failed with message", async () => {
    mockPrisma.crawlJob.findUnique.mockResolvedValue(jobWith(source()));
    mockPrisma.crawlJob.update.mockResolvedValue({});

    const result = await runConnectorJob("job-1", {
      transport: new MockTransport({}),
      rateLimiter: new NoopRateLimiter(),
      connector: fakeConnector({
        async fetchListings() {
          throw new Error("network exploded");
        },
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/network exploded/);
    const lastCall = mockPrisma.crawlJob.update.mock.calls.at(-1)![0];
    expect(lastCall.data.status).toBe("failed");
    expect(lastCall.data.errorMessage).toMatch(/network exploded/);
  });

  it("validateSource ok=false → job failed before any fetch", async () => {
    mockPrisma.crawlJob.findUnique.mockResolvedValue(jobWith(source()));
    mockPrisma.crawlJob.update.mockResolvedValue({});
    const fetchSpy = vi.fn();
    const result = await runConnectorJob("job-1", {
      transport: new MockTransport({}),
      rateLimiter: new NoopRateLimiter(),
      connector: fakeConnector({
        validateSource: async () => ({
          ok: false,
          issues: ["missing feedUrl"],
          warnings: [],
        }),
        fetchListings: fetchSpy,
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/source_validation_failed/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("already-terminal job returns without re-running", async () => {
    mockPrisma.crawlJob.findUnique.mockResolvedValue(jobWith(source(), "succeeded"));
    const result = await runConnectorJob("job-1", {
      transport: new MockTransport({}),
      rateLimiter: new NoopRateLimiter(),
      connector: fakeConnector(),
    });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/terminal state/);
    expect(mockPrisma.crawlJob.update).not.toHaveBeenCalled();
  });

  it("running jobs are picked up (worker-crash recovery)", async () => {
    mockPrisma.crawlJob.findUnique.mockResolvedValue(jobWith(source(), "running"));
    mockPrisma.crawlJob.update.mockResolvedValue({});
    mockPrisma.rawListing.create.mockResolvedValue({ id: "r" });
    const result = await runConnectorJob("job-1", {
      transport: new MockTransport({}),
      rateLimiter: new NoopRateLimiter(),
      connector: fakeConnector(),
    });
    expect(result.ok).toBe(true);
  });
});
