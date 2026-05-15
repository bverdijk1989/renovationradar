import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockTransport } from "@/server/connectors";

// ---------------------------------------------------------------------------
// Mock Prisma + auditLog before importing the engine.
// ---------------------------------------------------------------------------
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    source: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    sourceReview: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrismaInner)),
  },
}));
const mockPrismaInner = {
  source: { create: vi.fn(), findFirst: vi.fn() },
  sourceReview: { create: vi.fn() },
};
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { discoverAgencies } from "./engine";
import { MockProvider } from "./providers/mock";

beforeEach(() => {
  vi.clearAllMocks();
  (mockPrisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: typeof mockPrismaInner) => unknown) => fn(mockPrismaInner),
  );
});

const AGENCY_HTML = `
  <html lang="fr">
    <head><title>Agence du Vieux Moulin</title></head>
    <body>
      <h1>Agence immobilière à Bar-le-Duc</h1>
      <a href="mailto:contact@vieuxmoulin.fr">Contact</a>
    </body>
  </html>
`;

describe("discoverAgencies — end to end", () => {
  it("happy path: fetch → classify → persist", async () => {
    mockPrisma.source.findFirst.mockResolvedValue(null);
    mockPrismaInner.source.create.mockResolvedValue({
      id: "src-1",
      robotsStatus: "allows",
    });
    mockPrismaInner.sourceReview.create.mockResolvedValue({ id: "rev-1" });

    const transport = new MockTransport({
      "https://vieuxmoulin.fr/robots.txt": { body: "User-agent: *\nAllow: /\n" },
      "https://vieuxmoulin.fr/": { body: AGENCY_HTML },
    });

    const result = await discoverAgencies({
      provider: new MockProvider([
        { url: "https://vieuxmoulin.fr/", discoveryReason: "test seed" },
      ]),
      country: "FR",
      language: "fr",
      transport,
    });

    expect(result.candidatesFetched).toBe(1);
    expect(result.candidatesPersisted).toBe(1);
    expect(result.candidatesSkipped).toBe(0);
    expect(result.candidates[0]).toMatchObject({
      sourceId: "src-1",
      classification: "real_estate_agency",
      skipped: false,
    });

    // Source.create was called WITH status=pending_review (never auto-active).
    const createArgs = mockPrismaInner.source.create.mock.calls[0]![0];
    expect(createArgs.data.status).toBe("pending_review");
    expect(createArgs.data.legalStatus).toBe("pending_review");
    expect(createArgs.data.classification).toBe("real_estate_agency");

    // SourceReview row was written.
    expect(mockPrismaInner.sourceReview.create).toHaveBeenCalledTimes(1);
  });

  it("robots.txt Disallow → no fetch, source still persisted with classification=unknown", async () => {
    mockPrisma.source.findFirst.mockResolvedValue(null);
    mockPrismaInner.source.create.mockResolvedValue({
      id: "src-1",
      robotsStatus: "disallows",
    });
    mockPrismaInner.sourceReview.create.mockResolvedValue({ id: "rev-1" });

    let fetchCount = 0;
    const transport = new MockTransport((url) => {
      fetchCount += 1;
      if (url.endsWith("/robots.txt")) {
        return { body: "User-agent: *\nDisallow: /\n" };
      }
      // If the engine accidentally requests the page, we'd see another call.
      return { body: "should not be fetched" };
    });

    const result = await discoverAgencies({
      provider: new MockProvider([
        { url: "https://blocked.example/", discoveryReason: "test" },
      ]),
      country: "FR",
      language: "fr",
      transport,
    });

    expect(result.candidatesPersisted).toBe(1);
    expect(result.reasons.robots_blocked).toBe(1);
    expect(result.candidates[0]!.classification).toBe("unknown");
    // Engine fetched ONLY robots.txt, not the page.
    expect(fetchCount).toBe(1);

    const createArgs = mockPrismaInner.source.create.mock.calls[0]![0];
    expect(createArgs.data.classification).toBe("unknown");
    expect(createArgs.data.robotsStatus).toBe("disallows");
  });

  it("existing source → skipped, no duplicate created", async () => {
    mockPrisma.source.findFirst.mockResolvedValue({ id: "existing-1" });
    const transport = new MockTransport({
      "https://example.fr/robots.txt": { body: "" },
      "https://example.fr/": { body: AGENCY_HTML },
    });
    const result = await discoverAgencies({
      provider: new MockProvider([
        { url: "https://example.fr/", discoveryReason: "test" },
      ]),
      country: "FR",
      language: "fr",
      transport,
    });
    expect(result.candidatesPersisted).toBe(0);
    expect(result.candidatesSkipped).toBe(1);
    expect(result.reasons.skipped_existing).toBe(1);
    expect(mockPrismaInner.source.create).not.toHaveBeenCalled();
  });

  it("fetch failure → skipped + counted, never persists garbage", async () => {
    mockPrisma.source.findFirst.mockResolvedValue(null);
    const transport = new MockTransport((url) => {
      if (url.endsWith("/robots.txt")) return { body: "" };
      throw new Error("HTTP 503 fetching");
    });

    const result = await discoverAgencies({
      provider: new MockProvider([
        { url: "https://down.example/", discoveryReason: "test" },
      ]),
      country: "FR",
      language: "fr",
      transport,
    });

    expect(result.candidatesPersisted).toBe(0);
    expect(result.reasons.fetch_failed).toBe(1);
    expect(mockPrismaInner.source.create).not.toHaveBeenCalled();
  });

  it("queriesGenerated is included in the summary", async () => {
    mockPrisma.source.findFirst.mockResolvedValue(null);
    const result = await discoverAgencies({
      provider: new MockProvider([]),
      country: "FR",
      language: "fr",
      region: "Lorraine",
      transport: new MockTransport({}),
    });
    expect(result.queriesGenerated).toBeGreaterThan(0);
  });

  it("portal domains are correctly flagged", async () => {
    mockPrisma.source.findFirst.mockResolvedValue(null);
    mockPrismaInner.source.create.mockResolvedValue({
      id: "src-1",
      robotsStatus: "allows",
    });
    mockPrismaInner.sourceReview.create.mockResolvedValue({});
    const transport = new MockTransport({
      "https://www.immoweb.be/robots.txt": { body: "" },
      "https://www.immoweb.be/": { body: "<html><body>portal</body></html>" },
    });
    const result = await discoverAgencies({
      provider: new MockProvider([
        { url: "https://www.immoweb.be/", discoveryReason: "test" },
      ]),
      country: "BE",
      language: "nl",
      transport,
    });
    expect(result.candidates[0]!.classification).toBe("portal");
  });
});
