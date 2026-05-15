import "server-only";
import { prisma } from "@/lib/db";
import { NotFoundError } from "../api/http";
import {
  paginatedResponse,
  paginationToPrisma,
  type PaginatedResponse,
} from "../api/pagination";
import type {
  AlertCreateInput,
  AlertPatchInput,
} from "../schemas/alerts";
import type { z } from "zod";
import type { AlertListQuerySchema } from "../schemas/alerts";

type ListQuery = z.infer<typeof AlertListQuerySchema>;

export async function listAlerts(
  userId: string,
  q: ListQuery,
): Promise<PaginatedResponse<Awaited<ReturnType<typeof prisma.alert.findFirst>>>> {
  const where = {
    userId,
    ...(q.enabled !== undefined ? { enabled: q.enabled } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.alert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...paginationToPrisma(q),
    }),
    prisma.alert.count({ where }),
  ]);
  return paginatedResponse(data, total, q);
}

export async function createAlert(userId: string, input: AlertCreateInput) {
  return prisma.alert.create({
    data: {
      userId,
      name: input.name,
      enabled: input.enabled,
      channel: input.channel,
      frequency: input.frequency,
      criteria: input.criteria as never,
    },
  });
}

export async function patchAlert(
  userId: string,
  id: string,
  input: AlertPatchInput,
) {
  const existing = await prisma.alert.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Alert");
  // Users can only patch their own alerts. Admins use a separate endpoint.
  if (existing.userId !== userId) throw new NotFoundError("Alert");

  return prisma.alert.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      ...(input.criteria !== undefined ? { criteria: input.criteria as never } : {}),
    },
  });
}
