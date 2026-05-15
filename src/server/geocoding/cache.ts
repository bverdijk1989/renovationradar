import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { describeQuery, hashQuery } from "./normalize";
import type { GeocodeQuery, GeocodeResult } from "./types";

/**
 * Geocode cache — backed by the `geocode_cache` table.
 *
 * Hit path:
 *   - Lookup by sha256 of the normalised query.
 *   - On hit: increment `hits`, update `updatedAt`, return the cached
 *     lat/lng/accuracy/provider/confidence.
 *
 * Miss path: caller (engine) gets null, calls provider, then writes back via
 * `set()`. Provider responses with lat==null are still cached — they're
 * negative results (this address truly can't be geocoded) and re-querying
 * the same dud daily is the kind of waste this cache exists to prevent.
 *
 * Idempotent + safe under concurrent writers thanks to `upsert`.
 */
export class GeocodeCache {
  async get(query: GeocodeQuery): Promise<GeocodeResult | null> {
    const hash = hashQuery(query);
    const row = await prisma.geocodeCache.findUnique({ where: { queryHash: hash } });
    if (!row) return null;

    // Bump the hit counter (best-effort, fire-and-forget would be fine too).
    await prisma.geocodeCache
      .update({
        where: { queryHash: hash },
        data: { hits: { increment: 1 } },
      })
      .catch(() => {});

    if (row.lat == null || row.lng == null) return null;

    return {
      lat: row.lat,
      lng: row.lng,
      accuracy: row.accuracy ?? "unknown",
      provider: row.provider,
      confidence: row.confidence,
      distanceType:
        row.provider === "estimated_region" ? "estimated" : "straight_line",
      raw: row.rawResponse as never,
    };
  }

  async set(query: GeocodeQuery, result: GeocodeResult | null): Promise<void> {
    const hash = hashQuery(query);
    const data: Prisma.GeocodeCacheCreateInput = {
      queryHash: hash,
      query: describeQuery(query),
      lat: result?.lat ?? null,
      lng: result?.lng ?? null,
      accuracy: result?.accuracy ?? null,
      provider: result?.provider ?? "negative",
      confidence: result?.confidence ?? "low",
      rawResponse: (result?.raw ?? null) as never,
    };
    await prisma.geocodeCache.upsert({
      where: { queryHash: hash },
      create: data,
      update: {
        lat: data.lat,
        lng: data.lng,
        accuracy: data.accuracy,
        provider: data.provider,
        confidence: data.confidence,
        rawResponse: data.rawResponse,
      },
    });
  }
}

/**
 * No-op cache for tests that don't care about persistence. Use this when
 * the test wants to verify provider/engine behaviour without DB plumbing.
 */
export class NoopCache {
  async get(_query: GeocodeQuery): Promise<GeocodeResult | null> {
    return null;
  }
  async set(_query: GeocodeQuery, _result: GeocodeResult | null): Promise<void> {
    /* noop */
  }
}

/** Shared interface so engine accepts either real or noop cache. */
export interface GeocodeCacheLike {
  get(query: GeocodeQuery): Promise<GeocodeResult | null>;
  set(query: GeocodeQuery, result: GeocodeResult | null): Promise<void>;
}
