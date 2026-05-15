import { z } from "zod";
import { CountrySchema, LanguageSchema, csvArray } from "./common";
import { PaginationSchema } from "../api/pagination";

export const SearchProfileCategorySchema = z.enum([
  "general",
  "rural",
  "land",
  "special_object",
  "detached",
]);

export const SearchProfileListQuerySchema = PaginationSchema.extend({
  country: csvArray(CountrySchema).optional(),
  language: csvArray(LanguageSchema).optional(),
  category: csvArray(SearchProfileCategorySchema).optional(),
  active: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "boolean" ? v : v === "true"))
    .optional(),
});

export const SearchProfileCreateSchema = z.object({
  name: z.string().min(1).max(200),
  country: CountrySchema,
  language: LanguageSchema,
  category: SearchProfileCategorySchema,
  terms: z.array(z.string().min(1).max(200)).min(1).max(500),
  active: z.boolean().default(true),
});
export type SearchProfileCreateInput = z.infer<typeof SearchProfileCreateSchema>;

export const SearchProfilePatchSchema = z
  .object({
    name: z.string().min(1).max(200),
    country: CountrySchema,
    language: LanguageSchema,
    category: SearchProfileCategorySchema,
    terms: z.array(z.string().min(1).max(200)).min(1).max(500),
    active: z.boolean(),
  })
  .partial();
export type SearchProfilePatchInput = z.infer<typeof SearchProfilePatchSchema>;
