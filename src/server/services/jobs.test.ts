import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    source: { findUnique: vi.fn() },
    searchProfile: { findUnique: vi.fn() },
    crawlJob: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { enqueueSearchJob } from "./jobs";
import { BadRequestError } from "../api/http";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enqueueSearchJob — green-gate", () => {
  it("rejects when source does not exist", async () => {
    mockPrisma.source.findUnique.mockResolvedValue(null);
    await expect(
      enqueueSearchJob({ sourceId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("rejects sources that are not status=active", async () => {
    mockPrisma.source.findUnique.mockResolvedValue({
      id: "s1",
      status: "pending_review",
      legalStatus: "green",
    });
    await expect(enqueueSearchJob({ sourceId: "s1" })).rejects.toThrow(
      /status is 'pending_review'/,
    );
    expect(mockPrisma.crawlJob.create).not.toHaveBeenCalled();
  });

  it("rejects sources that are not legalStatus=green", async () => {
    mockPrisma.source.findUnique.mockResolvedValue({
      id: "s1",
      status: "active",
      legalStatus: "amber",
    });
    await expect(enqueueSearchJob({ sourceId: "s1" })).rejects.toThrow(
      /legalStatus is 'amber'/,
    );
    expect(mockPrisma.crawlJob.create).not.toHaveBeenCalled();
  });

  it("rejects unknown searchProfileId", async () => {
    mockPrisma.source.findUnique.mockResolvedValue({
      id: "s1",
      status: "active",
      legalStatus: "green",
    });
    mockPrisma.searchProfile.findUnique.mockResolvedValue(null);
    await expect(
      enqueueSearchJob({
        sourceId: "s1",
        searchProfileId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("creates a queued CrawlJob when source is green and active", async () => {
    mockPrisma.source.findUnique.mockResolvedValue({
      id: "s1",
      status: "active",
      legalStatus: "green",
    });
    mockPrisma.crawlJob.create.mockResolvedValue({ id: "j1", status: "queued" });

    const job = await enqueueSearchJob({ sourceId: "s1" });
    expect(job.status).toBe("queued");
    const createArgs = mockPrisma.crawlJob.create.mock.calls[0]![0];
    expect(createArgs.data.status).toBe("queued");
    expect(createArgs.data.sourceId).toBe("s1");
  });
});
