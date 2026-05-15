import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { BadRequestError } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { CountrySchema, LanguageSchema } from "@/server/schemas/common";
import {
  discoverAgencies,
  ManualImportProvider,
} from "@/server/discovery";
import { groupByLocale, parseSourcesCsv } from "@/server/discovery/csv";

/**
 * Max aantal URLs per upload. Houd dit klein zodat één upload binnen één
 * HTTP-request kan worden afgerond (Nominatim + page-fetches per URL).
 * Voor grotere imports → BullMQ worker (fase 5+).
 */
const MAX_URLS_PER_UPLOAD = 50;

const FormFieldsSchema = z.object({
  defaultCountry: CountrySchema,
  defaultLanguage: LanguageSchema,
  defaultRegion: z.string().max(200).optional(),
  dryRun: z
    .union([z.string(), z.boolean()])
    .transform((v) => v === true || v === "true" || v === "on")
    .default(false),
});

/**
 * POST /api/discovery/import-csv (admin)
 *
 * Multipart/form-data body:
 *   file: CSV (UTF-8, comma OR semicolon, optional header)
 *   defaultCountry: "FR" | "BE" | "DE" | "NL"   — fallback voor rijen zonder eigen country
 *   defaultLanguage: "fr" | "nl" | "de" | "en"
 *   defaultRegion?: string
 *   dryRun?: "true"   — alleen parsen + groeperen, niet draaien
 *
 * Response:
 *   {
 *     parsed: { rows, errors, delimiter, hadHeader },
 *     dryRun: bool,
 *     groups: [
 *       { country, language, region, urls,
 *         result?: DiscoveryRunResult (alleen bij dryRun=false) }
 *     ]
 *   }
 */
export const POST = withApi(async (req: NextRequest) => {
  const admin = await requireAdmin(req);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new BadRequestError("Field 'file' ontbreekt of is geen bestand");
  }
  if (file.size > 1_000_000) {
    throw new BadRequestError("CSV is groter dan 1 MB — splits de upload");
  }

  const fields = FormFieldsSchema.parse({
    defaultCountry: form.get("defaultCountry"),
    defaultLanguage: form.get("defaultLanguage"),
    defaultRegion: form.get("defaultRegion") ?? undefined,
    dryRun: form.get("dryRun"),
  });

  const text = await file.text();
  const parsed = parseSourcesCsv(text);

  if (parsed.rows.length === 0) {
    return ok({
      parsed,
      dryRun: fields.dryRun,
      groups: [],
      message: "Geen geldige URLs gevonden in de CSV.",
    });
  }
  if (parsed.rows.length > MAX_URLS_PER_UPLOAD) {
    throw new BadRequestError(
      `Te veel URLs (${parsed.rows.length} > ${MAX_URLS_PER_UPLOAD}). Splits de CSV in kleinere batches.`,
    );
  }

  const groups = groupByLocale(parsed.rows, {
    country: fields.defaultCountry,
    language: fields.defaultLanguage,
    region: fields.defaultRegion ?? null,
  });

  // ----- Dry run: stop na parsen + groeperen -------------------------------
  if (fields.dryRun) {
    await auditLog({
      req,
      userId: admin.id,
      action: "discovery_run",
      entityType: "source",
      entityId: null,
      meta: {
        kind: "csv_dry_run",
        rows: parsed.rows.length,
        groups: groups.length,
        errors: parsed.errors.length,
      },
    });
    return ok({
      parsed: {
        rowCount: parsed.rows.length,
        errors: parsed.errors,
        delimiter: parsed.delimiter,
        hadHeader: parsed.hadHeader,
      },
      dryRun: true,
      groups: groups.map((g) => ({
        country: g.country,
        language: g.language,
        region: g.region,
        urls: g.urls,
      })),
    });
  }

  // ----- Echte run: per groep de Discovery Engine aanroepen ----------------
  const provider = new ManualImportProvider();
  const groupResults = [] as Array<{
    country: string;
    language: string;
    region: string | null;
    urls: number;
    result: Awaited<ReturnType<typeof discoverAgencies>>;
  }>;

  for (const g of groups) {
    const result = await discoverAgencies({
      provider,
      country: g.country,
      language: g.language,
      region: g.region,
      providerInput: { urls: g.urls },
      actorUserId: admin.id,
    });
    groupResults.push({
      country: g.country,
      language: g.language,
      region: g.region,
      urls: g.urls.length,
      result,
    });
  }

  const totals = groupResults.reduce(
    (acc, g) => ({
      candidatesFetched: acc.candidatesFetched + g.result.candidatesFetched,
      candidatesPersisted: acc.candidatesPersisted + g.result.candidatesPersisted,
      candidatesSkipped: acc.candidatesSkipped + g.result.candidatesSkipped,
    }),
    { candidatesFetched: 0, candidatesPersisted: 0, candidatesSkipped: 0 },
  );

  await auditLog({
    req,
    userId: admin.id,
    action: "discovery_run",
    entityType: "source",
    entityId: null,
    meta: {
      kind: "csv_import",
      rows: parsed.rows.length,
      groups: groups.length,
      errors: parsed.errors.length,
      ...totals,
    },
  });

  return ok({
    parsed: {
      rowCount: parsed.rows.length,
      errors: parsed.errors,
      delimiter: parsed.delimiter,
      hadHeader: parsed.hadHeader,
    },
    dryRun: false,
    totals,
    groups: groupResults,
  });
});
