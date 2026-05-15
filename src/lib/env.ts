import { z } from "zod";

/**
 * Server-side env. Throws at module load if anything required is missing or
 * malformed. Don't import this from client components.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(16),
  NEXTAUTH_URL: z.string().url().optional(),

  REDIS_URL: z.string().url(),

  MEILISEARCH_HOST: z.string().url(),
  MEILISEARCH_MASTER_KEY: z.string().min(1),

  ORIGIN_LAT: z.coerce.number().default(51.3704),
  ORIGIN_LNG: z.coerce.number().default(6.1724),
  ORIGIN_LABEL: z.string().default("Venlo"),
  MAX_DISTANCE_KM: z.coerce.number().int().positive().default(350),

  MAX_PRICE_EUR: z.coerce.number().int().positive().default(200_000),
  MIN_LAND_M2: z.coerce.number().int().positive().default(10_000),

  SEED_DEV_ADMIN_EMAIL: z.string().email().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;
export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
