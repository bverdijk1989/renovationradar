"use client";
import useSWR from "swr";
import { fetcher } from "@/lib/api-client";
import type { PaginatedResponse } from "@/server/api/pagination";
import type { ListingCardData } from "@/components/listings/listing-card";

export function useListings(queryString: string) {
  const key = `/api/listings?${queryString}`;
  return useSWR<PaginatedResponse<ListingCardData>>(key, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
}
