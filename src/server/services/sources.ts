import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../api/http";
import {
  paginatedResponse,
  paginationToPrisma,
  type PaginatedResponse,
} from "../api/pagination";
import type {
  SourceCheckInput,
  SourceCreateInput,
  SourceListQuery,
  SourcePatchInput,
} from "../schemas/sources";

function buildSourceWhere(q: SourceListQuery): Prisma.SourceWhereInput {
  const where: Prisma.SourceWhereInput = {};
  if (q.country?.length) where.country = { in: q.country };
  if (q.status?.length) where.status = { in: q.status };
  if (q.legalStatus?.length) where.legalStatus = { in: q.legalStatus };
  if (q.sourceType?.length) where.sourceType = { in: q.sourceType };
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: "insensitive" } },
      { website: { contains: q.search, mode: "insensitive" } },
      { notes: { contains: q.search, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function listSources(
  q: SourceListQuery,
): Promise<PaginatedResponse<Awaited<ReturnType<typeof prisma.source.findFirst>>>> {
  const where = buildSourceWhere(q);
  const [data, total] = await Promise.all([
    prisma.source.findMany({
      where,
      orderBy: { [q.sortBy]: q.sortDir },
      ...paginationToPrisma(q),
    }),
    prisma.source.count({ where }),
  ]);
  return paginatedResponse(data, total, q);
}

export async function getSource(id: string) {
  const source = await prisma.source.findUnique({
    where: { id },
    include: {
      reviews: { orderBy: { createdAt: "desc" }, take: 10 },
      _count: { select: { rawListings: true, normalizedListings: true, crawlJobs: true } },
    },
  });
  if (!source) throw new NotFoundError("Source");
  return source;
}

export async function createSource(input: SourceCreateInput) {
  // New sources always start as pending_review with pending legal status.
  // Admin must run a /check or explicitly activate after due diligence.
  return prisma.source.create({
    data: {
      name: input.name,
      country: input.country,
      website: input.website,
      sourceType: input.sourceType,
      collectionMethods: input.collectionMethods,
      notes: input.notes,
      connectorConfig: (input.connectorConfig ?? null) as never,
      rateLimitPerMinute: input.rateLimitPerMinute,
      userAgent: input.userAgent,
      status: "pending_review",
      robotsStatus: "unknown",
      termsStatus: "unknown",
      legalStatus: "pending_review",
    },
  });
}

export async function patchSource(id: string, input: SourcePatchInput) {
  const existing = await prisma.source.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Source");

  // Guard: cannot move a non-green source to active via PATCH. Must go
  // through /activate which enforces the same rule (defense in depth).
  if (input.status === "active") {
    const legal = input.legalStatus ?? existing.legalStatus;
    if (legal !== "green") {
      throw new BadRequestError(
        "Cannot set status=active while legalStatus is not 'green'",
      );
    }
  }

  return prisma.source.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
      ...(input.collectionMethods !== undefined
        ? { collectionMethods: input.collectionMethods }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.connectorConfig !== undefined
        ? { connectorConfig: input.connectorConfig as never }
        : {}),
      ...(input.rateLimitPerMinute !== undefined
        ? { rateLimitPerMinute: input.rateLimitPerMinute }
        : {}),
      ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
      ...(input.robotsStatus !== undefined ? { robotsStatus: input.robotsStatus } : {}),
      ...(input.termsStatus !== undefined ? { termsStatus: input.termsStatus } : {}),
      ...(input.legalStatus !== undefined ? { legalStatus: input.legalStatus } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
}

export async function checkSource(
  id: string,
  input: SourceCheckInput,
  reviewedById?: string | null,
) {
  const existing = await prisma.source.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Source");

  return prisma.$transaction(async (tx) => {
    await tx.sourceReview.create({
      data: {
        sourceId: id,
        reviewedById: reviewedById ?? null,
        robotsStatusAfter: input.robotsStatus,
        termsStatusAfter: input.termsStatus,
        legalStatusAfter: input.legalStatus,
        evidenceUrl: input.evidenceUrl,
        notes: input.notes,
      },
    });

    // If legal turned non-green, force-pause the source. Defensive: an
    // automated check that downgrades legal MUST take the source offline.
    const newStatus =
      input.legalStatus !== "green" && existing.status === "active"
        ? "paused"
        : existing.status;

    return tx.source.update({
      where: { id },
      data: {
        robotsStatus: input.robotsStatus,
        termsStatus: input.termsStatus,
        legalStatus: input.legalStatus,
        lastCheckedAt: new Date(),
        status: newStatus,
      },
    });
  });
}

export async function activateSource(id: string) {
  const existing = await prisma.source.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Source");
  if (existing.legalStatus !== "green") {
    throw new BadRequestError(
      "Source cannot be activated: legalStatus is not 'green'. Run /check first and ensure the legal review is green.",
    );
  }
  if (existing.status === "retired") {
    throw new ConflictError("Source is retired and cannot be reactivated.");
  }
  return prisma.source.update({
    where: { id },
    data: { status: "active" },
  });
}

export async function deactivateSource(id: string) {
  const existing = await prisma.source.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Source");
  if (existing.status === "retired") {
    throw new ConflictError("Source already retired.");
  }
  return prisma.source.update({
    where: { id },
    data: { status: "paused" },
  });
}
