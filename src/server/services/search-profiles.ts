import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError } from "../api/http";
import {
  paginatedResponse,
  paginationToPrisma,
  type PaginatedResponse,
} from "../api/pagination";
import type {
  SearchProfileCreateInput,
  SearchProfilePatchInput,
} from "../schemas/search-profiles";
import type { z } from "zod";
import type { SearchProfileListQuerySchema } from "../schemas/search-profiles";

type ListQuery = z.infer<typeof SearchProfileListQuerySchema>;

function buildWhere(q: ListQuery): Prisma.SearchProfileWhereInput {
  const where: Prisma.SearchProfileWhereInput = {};
  if (q.country?.length) where.country = { in: q.country };
  if (q.language?.length) where.language = { in: q.language };
  if (q.category?.length) where.category = { in: q.category };
  if (q.active !== undefined) where.active = q.active;
  return where;
}

export async function listSearchProfiles(
  q: ListQuery,
): Promise<PaginatedResponse<Awaited<ReturnType<typeof prisma.searchProfile.findFirst>>>> {
  const where = buildWhere(q);
  const [data, total] = await Promise.all([
    prisma.searchProfile.findMany({
      where,
      orderBy: [{ country: "asc" }, { language: "asc" }, { name: "asc" }],
      ...paginationToPrisma(q),
    }),
    prisma.searchProfile.count({ where }),
  ]);
  return paginatedResponse(data, total, q);
}

export async function createSearchProfile(input: SearchProfileCreateInput) {
  return prisma.searchProfile.create({
    data: {
      name: input.name,
      country: input.country,
      language: input.language,
      category: input.category,
      terms: input.terms,
      active: input.active,
    },
  });
}

export async function patchSearchProfile(id: string, input: SearchProfilePatchInput) {
  const existing = await prisma.searchProfile.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("SearchProfile");
  return prisma.searchProfile.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.terms !== undefined ? { terms: input.terms } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
}
