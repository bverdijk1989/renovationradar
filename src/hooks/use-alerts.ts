"use client";
import useSWR, { mutate } from "swr";
import { apiClient, fetcher } from "@/lib/api-client";
import type { PaginatedResponse } from "@/server/api/pagination";

export type AlertItem = {
  id: string;
  userId: string;
  name: string;
  enabled: boolean;
  channel: "email" | "web_push" | "in_app";
  frequency: "instant" | "daily" | "weekly";
  criteria: Record<string, unknown>;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const KEY = "/api/alerts";

export function useAlerts() {
  return useSWR<PaginatedResponse<AlertItem>>(KEY, fetcher, {
    revalidateOnFocus: false,
  });
}

export async function createAlert(input: {
  name: string;
  channel?: AlertItem["channel"];
  frequency?: AlertItem["frequency"];
  criteria: Record<string, unknown>;
}) {
  const result = await apiClient.post<AlertItem>(KEY, input);
  mutate(KEY);
  return result;
}

export async function patchAlert(id: string, patch: Partial<AlertItem>) {
  const result = await apiClient.patch<AlertItem>(`${KEY}/${id}`, patch);
  mutate(KEY);
  return result;
}
