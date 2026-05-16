import "server-only";
import { prisma } from "@/lib/db";
import { BadRequestError, NotFoundError } from "../api/http";
import {
  paginatedResponse,
  paginationToPrisma,
  type PaginatedResponse,
} from "../api/pagination";
import type { z } from "zod";
import type { JobListQuerySchema } from "../schemas/jobs";
import type { RunSearchJobInput } from "../schemas/jobs";
import { runConnectorJob } from "../connectors";
import type { CrawlRunResult } from "../connectors";
import { normalizePending } from "./normalization";
import { geocodePending } from "../geocoding";
import { applyDetectedFeeds } from "../discovery/feed-detection";

type ListQuery = z.infer<typeof JobListQuerySchema>;

export async function listJobs(
  q: ListQuery,
): Promise<PaginatedResponse<Awaited<ReturnType<typeof prisma.crawlJob.findFirst>>>> {
  const where = {
    ...(q.sourceId ? { sourceId: q.sourceId } : {}),
    ...(q.status?.length ? { status: { in: q.status } } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.crawlJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        source: { select: { id: true, name: true, country: true } },
        searchProfile: { select: { id: true, name: true } },
      },
      ...paginationToPrisma(q),
    }),
    prisma.crawlJob.count({ where }),
  ]);
  return paginatedResponse(data, total, q);
}

export async function getJob(id: string) {
  const job = await prisma.crawlJob.findUnique({
    where: { id },
    include: {
      source: true,
      searchProfile: true,
    },
  });
  if (!job) throw new NotFoundError("Job");
  return job;
}

/**
 * Enqueue a search job for a given source (and optional search profile).
 *
 * Legal guard: only sources with status='active' may be queued. This is the
 * same guard the BullMQ worker (fase 4) will run before executing the job,
 * but enforcing it here gives the user immediate feedback instead of a
 * silent failure later.
 */
export async function enqueueSearchJob(input: RunSearchJobInput) {
  const source = await prisma.source.findUnique({ where: { id: input.sourceId } });
  if (!source) throw new BadRequestError("sourceId references an unknown source");
  if (source.status !== "active") {
    throw new BadRequestError(
      `Source status is '${source.status}'. Only 'active' sources may be queued.`,
    );
  }
  if (source.legalStatus !== "green") {
    throw new BadRequestError(
      `Source legalStatus is '${source.legalStatus}'. Only 'green' sources may be queued.`,
    );
  }
  if (input.searchProfileId) {
    const profile = await prisma.searchProfile.findUnique({
      where: { id: input.searchProfileId },
    });
    if (!profile) {
      throw new BadRequestError("searchProfileId references an unknown profile");
    }
  }

  // For now we just persist a 'queued' CrawlJob row. The BullMQ worker
  // (fase 5+) calls `executeQueuedJob(jobId)` which runs the connector
  // framework. For dev there's an admin endpoint that does the same inline.
  return prisma.crawlJob.create({
    data: {
      sourceId: input.sourceId,
      searchProfileId: input.searchProfileId,
      status: "queued",
      meta: (input.meta ?? null) as never,
    },
  });
}

/**
 * Execute a queued CrawlJob by running its connector. This is the entry
 * point the BullMQ worker will call; for dev we also expose it via
 * POST /api/jobs/:id/execute so admins can trigger a run by hand.
 *
 * The connector framework (legal gate, rate limit, raw listing persistence,
 * job lifecycle) lives in src/server/connectors/runner.ts.
 */
export async function executeQueuedJob(jobId: string): Promise<CrawlRunResult> {
  const job = await prisma.crawlJob.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError("CrawlJob");
  return runConnectorJob(jobId);
}

export type RunAllResult = {
  totalSources: number;
  succeeded: number;
  failed: number;
  startedAt: string;
  finishedAt: string;
  results: Array<{
    sourceId: string;
    sourceName: string;
    jobId: string;
    ok: boolean;
    itemsFetched: number;
    itemsAccepted: number;
    itemsRejected: number;
    errorMessage?: string;
  }>;
  normalize: {
    totalCandidates: number;
    succeeded: number;
    failed: number;
  };
  geocode: {
    processed: number;
    succeeded: number;
    fromCache: number;
    estimated: number;
    skipped: number;
    failed: number;
  };
};

/**
 * Auto-crawl: enqueue + execute één CrawlJob per actieve+groene bron.
 * Bedoeld voor de systemd timer (deploy/renovationradar-crawl.timer).
 *
 * Geen search-profile: we doen een full sweep per source — connectors die
 * profile-aware zijn (api/html) kunnen hun eigen interne loop draaien.
 */
export async function runAllActiveSources(): Promise<RunAllResult> {
  const startedAt = new Date();
  const sources = await prisma.source.findMany({
    where: { status: "active", legalStatus: "green" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const results: RunAllResult["results"] = [];
  let succeeded = 0;
  let failed = 0;

  for (const s of sources) {
    // Sitemap-first: probeer auto-detectie bij scrape-bronnen zonder
    // expliciet geconfigureerde feed. Goedkoop (1 robots.txt + ~4 HEAD
    // calls) en lost JS-rendered probleem op zodra een site een sitemap
    // publiceert. Geen-effect bij bronnen die al een sitemap/rss config
    // hebben staan.
    try {
      await applyDetectedFeeds(s.id);
    } catch {
      // Best-effort; faalt → fallback op huidige sourceType.
    }

    const job = await prisma.crawlJob.create({
      data: { sourceId: s.id, status: "queued" },
    });
    try {
      const r = await runConnectorJob(job.id);
      if (r.ok) succeeded++;
      else failed++;
      results.push({
        sourceId: s.id,
        sourceName: s.name,
        jobId: job.id,
        ok: r.ok,
        itemsFetched: r.itemsFetched,
        itemsAccepted: r.itemsAccepted,
        itemsRejected: r.itemsRejected,
        errorMessage: r.errorMessage ?? undefined,
      });
    } catch (e) {
      failed++;
      results.push({
        sourceId: s.id,
        sourceName: s.name,
        jobId: job.id,
        ok: false,
        itemsFetched: 0,
        itemsAccepted: 0,
        itemsRejected: 0,
        errorMessage: (e as Error).message,
      });
    }
  }

  // Na de crawl-fase: probeer de net opgeslagen raw_listings meteen door
  // de normalisatie te halen, zodat de dashboard listings krijgt. Faalt dit
  // dan zijn de raw rows niet verloren — een latere /api/normalize/run-pending
  // pakt ze opnieuw op.
  const normalize = await normalizePending(500).catch(() => ({
    totalCandidates: 0,
    succeeded: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  }));

  // Geocoding: voor listings die net gepersisteerd zijn maar nog geen
  // ListingLocation hebben. Nominatim's 1 req/sec policy limiteert ons
  // tot ~60/min — daarom cap op 100 per cron-tick. Resterende listings
  // worden bij de volgende run opgepakt (eventueel via een aparte timer
  // op /api/geocoding/run-pending als de queue te groot wordt).
  const geocode = await geocodePending({ limit: 100 }).catch((err) => {
    // Niet stilzwijgend slikken — surfaceren naar de journal-log zodat
    // we weten waarom de stap geen ListingLocation rows toevoegde.
    console.error("[runAllActiveSources] geocodePending failed:", err);
    return {
      processed: 0,
      succeeded: 0,
      fromCache: 0,
      estimated: 0,
      skipped: 0,
      failed: 0,
    };
  });

  return {
    totalSources: sources.length,
    succeeded,
    failed,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    results,
    normalize: {
      totalCandidates: normalize.totalCandidates,
      succeeded: normalize.succeeded,
      failed: normalize.failed,
    },
    geocode,
  };
}
