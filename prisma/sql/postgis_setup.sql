-- =============================================================================
-- Renovation Radar EU - PostGIS feature setup
-- =============================================================================
-- Idempotent. Run AFTER `prisma migrate deploy` (or `prisma migrate dev`).
--
-- Why a separate SQL file rather than a Prisma migration?
--   * Prisma's diff engine does not understand triggers, GiST/GIN indexes on
--     Unsupported types, or pg_trgm operator classes. Putting these in a
--     Prisma-generated migration causes future `migrate dev` runs to either
--     ignore them or attempt to recreate them incorrectly.
--   * Triggers (rather than GENERATED ALWAYS AS STORED) keep the columns
--     invisible to Prisma's column-type comparison: Prisma sees them as plain
--     `geography(Point, 4326)` and `double precision`, exactly as declared
--     in schema.prisma via `Unsupported(...)` and `Float?`.
--
-- Origin = Venlo (51.3704, 6.1724). The project is hard-coded to this point
-- because the brief itself is. If the origin ever changes, replace the
-- coordinates in `listing_locations_set_geo_columns` below and re-run.
-- =============================================================================

-- -------- Extensions --------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- pgvector goes here when we wire ListingEmbedding's actual vector column.
-- CREATE EXTENSION IF NOT EXISTS vector;

-- -------- Trigger: derive location & distance_from_venlo_km ----------------
-- Runs BEFORE INSERT and BEFORE UPDATE OF lat,lng so any code path that
-- writes lat/lng (geocoder, manual edit, seed) leaves the geo columns
-- consistent without needing to know about them.
CREATE OR REPLACE FUNCTION listing_locations_set_geo_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lat IS NULL OR NEW.lng IS NULL THEN
    NEW.location := NULL;
    NEW.distance_from_venlo_km := NULL;
  ELSE
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
    NEW.distance_from_venlo_km := ST_Distance(
      NEW.location,
      ST_SetSRID(ST_MakePoint(6.1724, 51.3704), 4326)::geography
    ) / 1000.0;  -- meters → kilometers
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listing_locations_set_geo_columns_trigger ON listing_locations;
CREATE TRIGGER listing_locations_set_geo_columns_trigger
  BEFORE INSERT OR UPDATE OF lat, lng ON listing_locations
  FOR EACH ROW
  EXECUTE FUNCTION listing_locations_set_geo_columns();

-- -------- Spatial index for fast bbox / distance queries -------------------
CREATE INDEX IF NOT EXISTS listing_locations_location_gix
  ON listing_locations USING GIST (location);

-- -------- Trigram indexes for fuzzy text search ----------------------------
-- Accelerate ILIKE '%term%' filters in the admin UI and similarity-based
-- dedup heuristics (matching the same listing across two agencies via
-- title or address similarity).
CREATE INDEX IF NOT EXISTS normalized_listings_title_original_trgm
  ON normalized_listings USING GIN (title_original gin_trgm_ops);

CREATE INDEX IF NOT EXISTS normalized_listings_title_nl_trgm
  ON normalized_listings USING GIN (title_nl gin_trgm_ops);

CREATE INDEX IF NOT EXISTS normalized_listings_address_trgm
  ON normalized_listings USING GIN (address_line gin_trgm_ops);

-- -------- Convenience view: listings within Venlo radius -------------------
-- Joins the listing with its location row and exposes distance directly.
-- Used by the dashboard and crawl-quality checks.
CREATE OR REPLACE VIEW listings_within_radius AS
SELECT
  nl.*,
  loc.lat,
  loc.lng,
  loc.distance_from_venlo_km
FROM normalized_listings nl
JOIN listing_locations loc ON loc.normalized_listing_id = nl.id
WHERE loc.distance_from_venlo_km IS NOT NULL
  AND loc.distance_from_venlo_km <= 350;

-- -------- Backfill: recompute geo columns for any existing rows ------------
-- Safe on a fresh DB (table is empty). On a populated DB it forces the
-- trigger to run for every row.
UPDATE listing_locations SET lat = lat WHERE lat IS NOT NULL;

-- -------- pgvector placeholder (commented out, ready to enable) -----------
-- When pgvector is enabled, run:
--
--   CREATE EXTENSION IF NOT EXISTS vector;
--   ALTER TABLE listing_embeddings
--     ADD COLUMN embedding vector(1536);
--   CREATE INDEX listing_embeddings_embedding_ivfflat
--     ON listing_embeddings USING ivfflat (embedding vector_cosine_ops)
--     WITH (lists = 100);
--
-- Keep the model_name / dimensions columns in ListingEmbedding consistent
-- with whatever model you target.
