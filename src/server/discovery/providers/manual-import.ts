import { InvalidProviderInputError } from "../errors";
import type {
  DiscoveryInput,
  DiscoveryProvider,
  RawCandidate,
} from "../types";

/**
 * ManualImport — the working, legal-safe provider.
 *
 * The admin pastes a list of candidate URLs (one per line, or a JSON array).
 * The engine still fetches + classifies each, BUT the URL list comes from a
 * human, not from a search API. That's the defensible flow until an
 * external search API is wired (fase 5+).
 *
 * `providerInput.urls` is required and accepts:
 *   - `string[]`
 *   - newline-separated `string`
 *
 * Bad URLs are dropped silently; the engine reports `candidatesSkipped`.
 */
export class ManualImportProvider implements DiscoveryProvider {
  readonly name = "manual-import-v1";

  async discover(input: DiscoveryInput): Promise<RawCandidate[]> {
    const raw = input.providerInput?.urls;
    if (raw == null) {
      throw new InvalidProviderInputError(
        "ManualImportProvider requires providerInput.urls (string[] or newline-separated string)",
      );
    }

    const urls: string[] = Array.isArray(raw)
      ? raw.filter((u): u is string => typeof u === "string")
      : typeof raw === "string"
        ? raw.split(/\r?\n/)
        : [];

    const valid = urls
      .map((u) => u.trim())
      .filter((u) => u.length > 0)
      .filter((u) => isHttpUrl(u));

    // Dedup while preserving order.
    const seen = new Set<string>();
    const unique = valid.filter((u) => {
      if (seen.has(u)) return false;
      seen.add(u);
      return true;
    });

    return unique.map((url) => ({
      url,
      discoveryReason: `Handmatig opgegeven door admin (land=${input.country}, taal=${input.language}${
        input.region ? `, regio=${input.region}` : ""
      })`,
    }));
  }
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
