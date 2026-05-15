import { z } from "zod";

/**
 * Offset pagination. Phase 2 keeps it simple; cursor pagination can be
 * layered on top later without breaking existing clients.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

export type Pagination = z.infer<typeof PaginationSchema>;

export function paginationToPrisma(p: Pagination) {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

export type PaginatedResponse<T> = {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};

export function paginatedResponse<T>(
  data: T[],
  total: number,
  p: Pagination,
): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      page: p.page,
      pageSize: p.pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / p.pageSize)),
    },
  };
}
