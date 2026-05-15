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
