import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type CrawlJob, type SearchProfile, type Source } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  ConnectorError,
  LegalGateError,
  NoConnectorError,
  SourceValidationError,
} from "./errors";
import type {
  CrawlRunResult,
  FetchContext,
  HttpTransport,
  RateLimiter,
  RawListingDraft,
  SourceConnector,
} from "./types";
import { FetchTransport } from "./transport";
import { InProcessRateLimiter } from "./rate-limit";
import { pickConnector } from "./registry";

/**
 * Drive a single crawl job from start to finish.
 *
 *   1. Load the CrawlJob (must be in 'queued' state).
 *   2. Apply the LEGAL GATE: source.status='active' AND legalStatus='green'.
 *      Anything else -> LegalGateError, job → failed, NOTHING is fetched.
 *   3. Pick the connector via the registry (canHandle).
 *   4. Run validateSource(). ok=false -> SourceValidationError -> failed.
 *   5. Move job to 'running', wait on the rate limiter.
 *   6. Invoke fetchListings(). Each returned RawListingDraft is hashed and
 *      written to RawListing (unique on contentHash so re-fetches dedupe).
 *   7. Move job to 'succeeded' (with counters) or 'failed' (with message).
 *
 * Returns the final summary so callers (BullMQ worker / API endpoint) can
 * surface it without re-reading the DB.
 *
 * Defaults to a real FetchTransport + InProcessRateLimiter, but both are
 * injectable for tests (MockTransport / NoopRateLimiter).
 */
export async function runConnectorJob(
  jobId: string,
  opts: {
    transport?: HttpTransport;
    rateLimiter?: RateLimiter;
    /** Override connector pick (tests). */
    connector?: SourceConnector;
    signal?: AbortSignal;
  } = {},
): Promise<CrawlRunResult> {
  const transport = opts.transport ?? new FetchTransport();
  const rateLimiter = opts.rateLimiter ?? new InProcessRateLimiter();

  // ----- Load job + source --------------------------------------------------
  const job = await prisma.crawlJob.findUnique({
    where: { id: jobId },
    include: { source: true, searchProfile: true },
  });
  if (!job) {
    throw new ConnectorError(`CrawlJob ${jobId} not found`) as unknown as Error;
  }

  // Tolerate `queued` and re-runs of already-`running` jobs (worker crash recovery).
  if (job.status !== "queued" && job.status !== "running") {
    return {
      jobId,
      ok: false,
      itemsFetched: 0,
      itemsAccepted: 0,
      itemsRejected: 0,
      errorMessage: `Job already in terminal state: ${job.status}`,
    };
  }

  try {
    // ----- Legal gate -------------------------------------------------------
    enforceLegalGate(job.source);

    // ----- Connector pick + validation -------------------------------------
    const connector = opts.connector ?? pickConnector(job.source);
    const validation = await connector.validateSource(job.source);
    if (!validation.ok) {
      throw new SourceValidationError(
        `Source validation failed: ${validation.issues.join("; ")}`,
        { issues: validation.issues, warnings: validation.warnings },
      );
    }

    // ----- Status: running --------------------------------------------------
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { status: "running", startedAt: new Date() },
    });

    // ----- Rate limit + fetch ----------------------------------------------
    await rateLimiter.wait(job.source.id, job.source.rateLimitPerMinute);

    const ctx: FetchContext = {
      transport,
      rateLimiter,
      crawlJobId: jobId,
      signal: opts.signal,
    };
    const drafts = await connector.fetchListings(job.source, job.searchProfile, ctx);

    // ----- Persist RawListings + dedupe -----------------------------------
    const persistResult = await persistRawListings(job.source.id, drafts, jobId);

    // ----- Status: succeeded ------------------------------------------------
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        itemsFetched: drafts.length,
        itemsAccepted: persistResult.accepted,
        itemsRejected: persistResult.rejected,
        meta: { connector: connector.name, warnings: validation.warnings } as never,
      },
    });

    return {
      jobId,
      ok: true,
      itemsFetched: drafts.length,
      itemsAccepted: persistResult.accepted,
      itemsRejected: persistResult.rejected,
      errorMessage: null,
    };
  } catch (err) {
    return await markJobFailed(jobId, err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function enforceLegalGate(source: Source): void {
  // No fetches against non-active sources. The admin must explicitly activate
  // a source after a SourceReview marks it legal_status=green.
  if (source.status !== "active") {
    throw new LegalGateError(
      `Source status is '${source.status}' (must be 'active' to crawl)`,
      { sourceId: source.id, status: source.status },
    );
  }
  if (source.legalStatus !== "green") {
    throw new LegalGateError(
      `Source legalStatus is '${source.legalStatus}' (must be 'green' to crawl)`,
      { sourceId: source.id, legalStatus: source.legalStatus },
    );
  }
  // Manual-only sources never go through the runner — their listings come in
  // via /api/listings/manual. If somebody queued one, bail.
  if (
    source.collectionMethods.length === 1 &&
    source.collectionMethods[0] === "manual_entry"
  ) {
    throw new LegalGateError(
      "Source is manual-entry only; cannot be crawled",
      { sourceId: source.id, collectionMethods: source.collectionMethods },
    );
  }
}

async function persistRawListings(
  sourceId: string,
  drafts: RawListingDraft[],
  crawlJobId: string,
): Promise<{ accepted: number; rejected: number }> {
  let accepted = 0;
  let rejected = 0;

  for (const draft of drafts) {
    const payload = { ...draft.payload, _crawlJobId: crawlJobId };
    const contentHash = sha256Json(payload);
    try {
      await prisma.rawListing.create({
        data: {
          sourceId,
          externalId: draft.externalId,
          url: draft.url,
          contentHash,
          payload: payload as never,
          language: draft.language ?? null,
        },
      });
      accepted++;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // (sourceId, contentHash) or (sourceId, externalId) unique violation.
        // This is the EXPECTED dedup path — a re-fetched, unchanged item.
        rejected++;
        continue;
      }
      // Anything else: count as rejected but keep the loop going so a single
      // bad item doesn't sink the whole job.
      rejected++;
      // eslint-disable-next-line no-console
      console.error("[connector] failed to persist RawListing:", err);
    }
  }
  return { accepted, rejected };
}

async function markJobFailed(
  jobId: string,
  err: unknown,
): Promise<CrawlRunResult> {
  const message =
    err instanceof ConnectorError
      ? `${err.code}: ${err.message}`
      : err instanceof Error
        ? err.message
        : String(err);
  const meta =
    err instanceof ConnectorError ? { code: err.code, details: err.details } : null;

  await prisma.crawlJob
    .update({
      where: { id: jobId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage: message,
        meta: (meta ?? null) as never,
      },
    })
    .catch(() => {
      // If we can't even write the failure row, just log — the worker will
      // retry. Don't swallow the original error chain.
    });

  return {
    jobId,
    ok: false,
    itemsFetched: 0,
    itemsAccepted: 0,
    itemsRejected: 0,
    errorMessage: message,
  };
}

function sha256Json(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

export type { CrawlJob };
