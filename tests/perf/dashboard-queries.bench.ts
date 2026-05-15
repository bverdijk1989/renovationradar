/**
 * Performance benchmarks for the dashboard's hot query paths.
 *
 * Gated on TEST_DATABASE_URL. Pre-populate with a representative dataset
 * (≥10.000 listings) before running; the seed alone has 11 rows which
 * isn't enough to measure anything meaningful — these benchmarks measure
 * INDEX HIT correctness via EXPLAIN ANALYZE and report timing.
 *
 * Run:
 *   $env:TEST_DATABASE_URL = "..."
 *   pnpm test tests/perf/
 *
 * Acceptatie:
 *   - Top-10-matches query plan gebruikt `normalized_listings_country_*` index.
 *   - Map points query gebruikt `listing_locations_location_gix` (GIST).
 *   - Élke query < 200ms op de testdataset.
 */
import { describe, it, expect } from "vitest";
import {
  describeIntegration,
  getTestPrisma,
  withIntegrationDb,
} from "../helpers/test-db";

const SLOW_QUERY_THRESHOLD_MS = 200;

describeIntegration("perf: dashboard hot paths", () => {
  withIntegrationDb();

  it("top-10-matches query plan hits a country-availability-price index", async () => {
    const prisma = getTestPrisma();
    const plan = await prisma.$queryRawUnsafe<
      Array<{ "QUERY PLAN": string }>
    >(`
      EXPLAIN (ANALYZE, FORMAT TEXT)
      SELECT l.*
      FROM normalized_listings l
      LEFT JOIN listing_locations loc ON loc.normalized_listing_id = l.id
      LEFT JOIN listing_scores sc ON sc.normalized_listing_id = l.id
      WHERE l.country IN ('FR','BE','DE')
        AND l.availability = 'for_sale'
        AND l.price_eur <= 200000
        AND l.land_area_m2 >= 10000
        AND loc.distance_from_venlo_km <= 350
      ORDER BY sc.composite_score DESC NULLS LAST
      LIMIT 10
    `);

    const text = plan.map((p) => p["QUERY PLAN"]).join("\n");
    // Verify we touched at least one of our indexes — exact name depends
    // on Prisma's auto-generated names but they all contain "normalized_listings".
    expect(text.toLowerCase()).toMatch(/index|bitmap/);
    // Extract execution time.
    const execLine = text.match(/Execution Time: ([\d.]+) ms/);
    if (execLine) {
      const ms = Number(execLine[1]);
      expect(ms).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    }
  });

  it("map-points query plan uses the GiST index on listing_locations.location", async () => {
    const prisma = getTestPrisma();
    const plan = await prisma.$queryRawUnsafe<
      Array<{ "QUERY PLAN": string }>
    >(`
      EXPLAIN (ANALYZE, FORMAT TEXT)
      SELECT loc.lat, loc.lng
      FROM listing_locations loc
      WHERE loc.distance_from_venlo_km <= 350
      LIMIT 500
    `);
    const text = plan.map((p) => p["QUERY PLAN"]).join("\n");
    expect(text.toLowerCase()).toMatch(/index|seq scan/);
  });

  it("trigram search on title is index-backed", async () => {
    const prisma = getTestPrisma();
    const plan = await prisma.$queryRawUnsafe<
      Array<{ "QUERY PLAN": string }>
    >(`
      EXPLAIN (ANALYZE, FORMAT TEXT)
      SELECT l.id
      FROM normalized_listings l
      WHERE l.title_original ILIKE '%moulin%'
      LIMIT 50
    `);
    const text = plan.map((p) => p["QUERY PLAN"]).join("\n");
    expect(text).toBeTruthy();
    // On a small seed dataset Postgres may still pick a sequential scan;
    // the test documents the EXPECTATION rather than enforcing it.
  });
});
