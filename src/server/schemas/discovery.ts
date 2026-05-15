import { z } from "zod";
import { CountrySchema, LanguageSchema } from "./common";

export const DiscoveryRunSchema = z.object({
  country: CountrySchema,
  language: LanguageSchema,
  region: z.string().max(200).optional(),

  /** Which provider to use. Default: "manual_import". */
  provider: z.enum(["manual_import", "search_api"]).default("manual_import"),

  /**
   * Provider-specific input. For manual_import, expects `urls` as a
   * newline-separated string or string[]. SearchApi reads its own keys.
   */
  providerInput: z
    .object({
      urls: z
        .union([z.string(), z.array(z.string().url())])
        .optional(),
    })
    .passthrough()
    .optional(),
});

export type DiscoveryRunInput = z.infer<typeof DiscoveryRunSchema>;
