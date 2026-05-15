import type { SearchProfile, Source } from "@prisma/client";
import { NotImplementedError } from "./errors";
import type {
  FetchContext,
  RawListingDraft,
  SourceConnector,
  SourceValidationResult,
} from "./types";

/**
 * EmailNewsletterConnector — placeholder.
 *
 * Once implemented this connector reads a dedicated mailbox (e.g. via IMAP
 * or via webhook from a forwarding service) and parses each listing
 * newsletter into one or more RawListings. Until then it stays as a
 * placeholder so the registry can answer "yes, we know about email sources"
 * and route the legal gate properly.
 *
 * Recommended composition once implemented:
 *   1. Subscribe to a Forwarding-As-A-Service like Postmark inbound or AWS SES.
 *   2. Connector receives parsed email payloads via a webhook endpoint
 *      (not this run() path).
 *   3. This connector's `fetchListings` becomes "drain the inbox queue and
 *      return new payloads" — pulling from Redis, S3, or wherever the
 *      webhook deposited them.
 */
export class EmailNewsletterConnector implements SourceConnector {
  readonly name = "email-v0-stub";
  readonly sourceType = "email" as const;

  canHandle(source: Source): boolean {
    return (
      source.sourceType === "email" ||
      source.collectionMethods.includes("email_inbox")
    );
  }

  async validateSource(_source: Source): Promise<SourceValidationResult> {
    return {
      ok: false,
      issues: [
        "EmailNewsletterConnector is a placeholder for fase 5+. Wire up a webhook receiver (Postmark / SES) and a queue, then override fetchListings().",
      ],
      warnings: [],
    };
  }

  async fetchListings(
    _source: Source,
    _profile: SearchProfile | null,
    _ctx: FetchContext,
  ): Promise<RawListingDraft[]> {
    throw new NotImplementedError(
      "EmailNewsletterConnector is a placeholder. See docs/CONNECTORS.md.",
    );
  }
}
