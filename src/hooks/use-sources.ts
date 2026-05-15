"use client";
import useSWR from "swr";
import { apiClient, fetcher } from "@/lib/api-client";
import type { PaginatedResponse } from "@/server/api/pagination";

export type SourceListItem = {
  id: string;
  name: string;
  country: string;
  website: string;
  sourceType: string;
  status: string;
  legalStatus: string;
  robotsStatus: string;
  termsStatus: string;
  lastCheckedAt: string | null;
  notes: string | null;
  rateLimitPerMinute: number | null;
};

export function useSources(queryString = "") {
  const key = `/api/sources${queryString ? `?${queryString}` : ""}`;
  return useSWR<PaginatedResponse<SourceListItem>>(key, fetcher, {
    revalidateOnFocus: false,
  });
}

export async function activateSource(id: string) {
  return apiClient.post(`/api/sources/${id}/activate`, {});
}
export async function deactivateSource(id: string) {
  return apiClient.post(`/api/sources/${id}/deactivate`, {});
}
export async function approveSourceReview(id: string, notes?: string) {
  return apiClient.post(`/api/review/sources/${id}/approve`, { notes });
}
export async function rejectSourceReview(id: string, notes?: string) {
  return apiClient.post(`/api/review/sources/${id}/reject`, { notes });
}
