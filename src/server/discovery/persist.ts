import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auditLog } from "../api/audit";
import type { Candidate } from "./types";

/**
 * Turn a fully-enriched Candidate into:
 *   1. A Source row with status=pending_review, legalStatus=pending_review,
 *      classification=<resolved>, discoveryMeta=<reason + evidence>.
 *   2. A SourceReview row that records the as-found robots/terms/legal
 *      status with the candidate URL as `evidenceUrl` — this is what shows
 *      up in the admin review queue.
 *   3. An AuditLog entry for traceability.
 *
 * Idempotent on a per-website basis: if a Source with the same `website`
 * already exists, we DON'T overwrite it. Returns the existing source
 * unchanged so the engine can count it as "skipped".
 *
 * The function NEVER activates a source. status='active' must be set
 * explicitly via the admin Review queue (POST /api/review/sources/:id/approve).
 */
export async function persistCandidate(
  candidate: Candidate,
  opts: { actorUserId?: string | null } = {},
): Promise<{ sourceId: string; created: boolean }> {
  const existing = await prisma.source.findFirst({
    where: { website: candidate.finalUrl },
    select: { id: true },
  });
  if (existing) {
    return { sourceId: existing.id, created: false };
  }

  // Map the classification to a sensible sourceType. The admin can refine
  // this in the review UI before activating.
  const sourceType =
    candidate.classification === "portal"
      ? "scrape"
      : candidate.classification === "real_estate_agency"
        ? "scrape"
        : "manual";

  const name = candidate.name ?? hostnameFallback(candidate.finalUrl);

  const created = await prisma.$transaction(async (tx) => {
    let source;
    try {
      source = await tx.source.create({
        data: {
          name,
          country: candidate.country,
          website: candidate.finalUrl,
          sourceType,
          collectionMethods:
            candidate.classification === "real_estate_agency"
              ? ["scrape_with_permission"]
              : ["manual_entry"],
          status: "pending_review",
          robotsStatus: candidate.robotsAllowed ? "allows" : "disallows",
          termsStatus: "unknown",
          legalStatus: "pending_review",
          classification: candidate.classification,
          discoveryMeta: {
            provider: candidate.providerName,
            reason: candidate.discoveryReason,
            classificationConfidence: candidate.classificationConfidence,
            classificationEvidence: candidate.classificationEvidence,
            robotsEvidence: candidate.robotsEvidence,
            extracted: {
              email: candidate.email,
              phone: candidate.phone,
              listingPageUrl: candidate.listingPageUrl,
              region: candidate.region,
              language: candidate.language,
            },
          } as never,
          notes: buildNotes(candidate),
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // Lost the race with another discovery run that created the same
        // (country, name) — treat as existing.
        const dup = await tx.source.findFirst({
          where: { website: candidate.finalUrl },
          select: { id: true },
        });
        if (dup) return { id: dup.id, _existed: true };
      }
      throw err;
    }

    await tx.sourceReview.create({
      data: {
        sourceId: source.id,
        reviewedById: opts.actorUserId ?? null,
        robotsStatusAfter: source.robotsStatus,
        termsStatusAfter: "unknown",
        legalStatusAfter: "pending_review",
        evidenceUrl: candidate.finalUrl,
        notes: buildReviewNote(candidate),
      },
    });

    return { id: source.id, _existed: false };
  });

  await auditLog({
    userId: opts.actorUserId ?? null,
    action: "discovery_run",
    entityType: "source",
    entityId: created.id,
    meta: {
      providerName: candidate.providerName,
      classification: candidate.classification,
      discoveryReason: candidate.discoveryReason,
    },
  });

  return { sourceId: created.id, created: !created._existed };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildNotes(c: Candidate): string {
  const lines = [
    `Geclassificeerd als ${c.classification} (vertrouwen ${Math.round(c.classificationConfidence * 100)}%).`,
    `Discovery-reden: ${c.discoveryReason}`,
    `robots.txt: ${c.robotsEvidence}`,
  ];
  if (c.email) lines.push(`Publiek e-mailadres: ${c.email}`);
  if (c.phone) lines.push(`Publiek telefoonnummer: ${c.phone}`);
  if (c.listingPageUrl) lines.push(`Mogelijke listing-pagina: ${c.listingPageUrl}`);
  return lines.join("\n");
}

function buildReviewNote(c: Candidate): string {
  return [
    `Gevonden door discovery-provider "${c.providerName}".`,
    `Classificatie: ${c.classification} (${Math.round(c.classificationConfidence * 100)}%).`,
    `Evidence: ${c.classificationEvidence.slice(0, 5).join("; ") || "geen specifiek bewijs"}.`,
    "Activeer alleen na handmatige verificatie van ToS, robots.txt en mogelijke listing-pagina.",
  ].join(" ");
}

function hostnameFallback(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
