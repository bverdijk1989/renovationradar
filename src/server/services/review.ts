import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError } from "../api/http";
import {
  paginatedResponse,
  paginationToPrisma,
  type Pagination,
  type PaginatedResponse,
} from "../api/pagination";

// ---------------------------------------------------------------------------
// Sources awaiting review
// ---------------------------------------------------------------------------

export async function listSourcesForReview(
  q: Pagination,
): Promise<PaginatedResponse<Awaited<ReturnType<typeof prisma.source.findFirst>>>> {
  const where: Prisma.SourceWhereInput = {
    OR: [{ status: "pending_review" }, { legalStatus: "pending_review" }],
  };
  const [data, total] = await Promise.all([
    prisma.source.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { reviews: { take: 1, orderBy: { createdAt: "desc" } } },
      ...paginationToPrisma(q),
    }),
    prisma.source.count({ where }),
  ]);
  return paginatedResponse(data, total, q);
}

export async function approveSourceReview(
  sourceId: string,
  reviewedById: string | null,
  notes?: string,
) {
  const existing = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!existing) throw new NotFoundError("Source");

  return prisma.$transaction(async (tx) => {
    await tx.sourceReview.create({
      data: {
        sourceId,
        reviewedById,
        robotsStatusAfter: existing.robotsStatus,
        termsStatusAfter: existing.termsStatus,
        legalStatusAfter: "green",
        notes: notes ?? "Approved via admin review queue",
      },
    });
    return tx.source.update({
      where: { id: sourceId },
      data: {
        legalStatus: "green",
        status: existing.status === "retired" ? "retired" : "active",
        lastCheckedAt: new Date(),
      },
    });
  });
}

export async function rejectSourceReview(
  sourceId: string,
  reviewedById: string | null,
  notes?: string,
) {
  const existing = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!existing) throw new NotFoundError("Source");

  return prisma.$transaction(async (tx) => {
    await tx.sourceReview.create({
      data: {
        sourceId,
        reviewedById,
        robotsStatusAfter: existing.robotsStatus,
        termsStatusAfter: existing.termsStatus,
        legalStatusAfter: "red",
        notes: notes ?? "Rejected via admin review queue",
      },
    });
    return tx.source.update({
      where: { id: sourceId },
      data: {
        legalStatus: "red",
        status: "blocked",
        lastCheckedAt: new Date(),
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Listings awaiting review (ReviewQueueItem)
// ---------------------------------------------------------------------------

export async function listListingsForReview(
  q: Pagination,
): Promise<PaginatedResponse<Awaited<ReturnType<typeof prisma.reviewQueueItem.findFirst>>>> {
  const where: Prisma.ReviewQueueItemWhereInput = { status: "pending" };
  const [data, total] = await Promise.all([
    prisma.reviewQueueItem.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: {
        listing: {
          include: {
            location: true,
            score: true,
            source: { select: { id: true, name: true } },
          },
        },
      },
      ...paginationToPrisma(q),
    }),
    prisma.reviewQueueItem.count({ where }),
  ]);
  return paginatedResponse(data, total, q);
}
