import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Prisma singleton. Order matters: vi.mock is hoisted by vitest,
// but the mock factory cannot reference top-level consts; use vi.hoisted.
const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      source: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      sourceReview: { create: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrismaInner)),
    },
  };
});

// Transactional Prisma needs the same shape inside the callback.
const mockPrismaInner = {
  sourceReview: { create: vi.fn() },
  source: { update: vi.fn() },
};

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

// Wire $transaction to call the callback with the inner mock.
(mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
  async (fn: (tx: typeof mockPrismaInner) => unknown) => fn(mockPrismaInner),
);

import {
  activateSource,
  checkSource,
  createSource,
  deactivateSource,
} from "./sources";
import { BadRequestError, ConflictError } from "../api/http";

beforeEach(() => {
  vi.clearAllMocks();
  (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: typeof mockPrismaInner) => unknown) => fn(mockPrismaInner),
  );
});

describe("createSource", () => {
  it("forces every new source to start as pending_review / pending_review", async () => {
    mockPrisma.source.create.mockResolvedValue({ id: "x" });
    await createSource({
      name: "Test",
      country: "FR",
      website: "https://example.com",
      sourceType: "rss",
      collectionMethods: ["rss"],
    });
    const args = mockPrisma.source.create.mock.calls[0]![0];
    expect(args.data.status).toBe("pending_review");
    expect(args.data.legalStatus).toBe("pending_review");
    expect(args.data.robotsStatus).toBe("unknown");
    expect(args.data.termsStatus).toBe("unknown");
  });
});

describe("activateSource", () => {
  it("refuses to activate when legalStatus is not green", async () => {
    mockPrisma.source.findUnique.mockResolvedValue({
      id: "s1",
      legalStatus: "pending_review",
      status: "pending_review",
    });
    await expect(activateSource("s1")).rejects.toBeInstanceOf(BadRequestError);
    expect(mockPrisma.source.update).not.toHaveBeenCalled();
  });

  it("refuses to activate a retired source", async () => {
    mockPrisma.source.findUnique.mockResolvedValue({
      id: "s1",
      legalStatus: "green",
      status: "retired",
    });
    await expect(activateSource("s1")).rejects.toBeInstanceOf(ConflictError);
  });

  it("activates a green, non-retired source", async () => {
    mockPrisma.source.findUnique.mockResolvedValue({
      id: "s1",
      legalStatus: "green",
      status: "paused",
    });
    mockPrisma.source.update.mockResolvedValue({ id: "s1", status: "active" });
    const result = await activateSource("s1");
    expect(result.status).toBe("active");
    expect(mockPrisma.source.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { status: "active" },
    });
  });
});

describe("deactivateSource", () => {
  it("pauses an active source", async () => {
    mockPrisma.source.findUnique.mockResolvedValue({ id: "s1", status: "active" });
    mockPrisma.source.update.mockResolvedValue({ id: "s1", status: "paused" });
    const result = await deactivateSource("s1");
    expect(result.status).toBe("paused");
  });

  it("refuses to deactivate a retired source", async () => {
    mockPrisma.source.findUnique.mockResolvedValue({ id: "s1", status: "retired" });
    await expect(deactivateSource("s1")).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("checkSource", () => {
  it("creates a SourceReview row + updates source fields", async () => {
    mockPrisma.source.findUnique.mockResolvedValue({
      id: "s1",
      status: "active",
      legalStatus: "green",
    });
    mockPrismaInner.source.update.mockResolvedValue({ id: "s1", status: "active" });

    await checkSource(
      "s1",
      {
        robotsStatus: "allows",
        termsStatus: "allows",
        legalStatus: "green",
        evidenceUrl: "https://web.archive.org/foo",
        notes: "Re-checked",
      },
      "admin-1",
    );

    expect(mockPrismaInner.sourceReview.create).toHaveBeenCalledTimes(1);
    expect(mockPrismaInner.source.update).toHaveBeenCalledTimes(1);
    const updateArgs = mockPrismaInner.source.update.mock.calls[0]![0];
    expect(updateArgs.data.lastCheckedAt).toBeInstanceOf(Date);
  });

  it("force-pauses an active source when the new legalStatus is not green", async () => {
    mockPrisma.source.findUnique.mockResolvedValue({
      id: "s1",
      status: "active",
      legalStatus: "green",
    });

    await checkSource(
      "s1",
      { robotsStatus: "disallows", termsStatus: "prohibits", legalStatus: "red" },
      "admin-1",
    );

    const updateArgs = mockPrismaInner.source.update.mock.calls[0]![0];
    expect(updateArgs.data.status).toBe("paused");
    expect(updateArgs.data.legalStatus).toBe("red");
  });

  it("leaves status alone when source was already paused", async () => {
    mockPrisma.source.findUnique.mockResolvedValue({
      id: "s1",
      status: "paused",
      legalStatus: "amber",
    });

    await checkSource(
      "s1",
      { robotsStatus: "allows", termsStatus: "allows", legalStatus: "green" },
      "admin-1",
    );
    const updateArgs = mockPrismaInner.source.update.mock.calls[0]![0];
    expect(updateArgs.data.status).toBe("paused");
  });
});
