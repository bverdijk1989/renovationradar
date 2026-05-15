/**
 * Locale-aware formatters. Everything renders in nl-NL because the UI is
 * Dutch. The output is deterministic enough to test against literals.
 */

const NL = "nl-NL";

const currency = new Intl.NumberFormat(NL, {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const compactNumber = new Intl.NumberFormat(NL, {
  notation: "compact",
  maximumFractionDigits: 1,
});

const integer = new Intl.NumberFormat(NL, { maximumFractionDigits: 0 });

const oneDecimal = new Intl.NumberFormat(NL, { maximumFractionDigits: 1 });

const dateFmt = new Intl.DateTimeFormat(NL, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const relativeFmt = new Intl.RelativeTimeFormat(NL, { numeric: "auto" });

export function formatPrice(eur: number | null | undefined): string {
  if (eur == null) return "—";
  return currency.format(eur);
}

export function formatLandArea(m2: number | null | undefined): string {
  if (m2 == null) return "—";
  if (m2 >= 10_000) {
    return `${oneDecimal.format(m2 / 10_000)} ha`;
  }
  return `${integer.format(m2)} m²`;
}

export function formatLivingArea(m2: number | null | undefined): string {
  if (m2 == null) return "—";
  return `${integer.format(m2)} m²`;
}

export function formatDistance(km: number | null | undefined): string {
  if (km == null) return "—";
  if (km < 10) return `${oneDecimal.format(km)} km`;
  return `${integer.format(km)} km`;
}

export function formatCompactNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return compactNumber.format(n);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return dateFmt.format(new Date(date));
}

export function formatRelative(
  date: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  if (!date) return "—";
  const d = new Date(date);
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (Math.abs(diffDays) < 1) {
    const diffHours = Math.round(diffMs / (60 * 60 * 1000));
    return relativeFmt.format(diffHours, "hour");
  }
  if (Math.abs(diffDays) < 30) return relativeFmt.format(diffDays, "day");
  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) return relativeFmt.format(diffMonths, "month");
  return relativeFmt.format(Math.round(diffMonths / 12), "year");
}

// ---------------------------------------------------------------------------
// Enum labels — short Dutch labels for property types, statuses, etc.
// ---------------------------------------------------------------------------

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  detached_house: "Vrijstaand huis",
  farmhouse: "Boerderij",
  longere: "Longère",
  manor: "Landhuis",
  mansion: "Herenhuis",
  barn: "Schuur",
  ruin: "Ruïne",
  mill: "Molen",
  watermill: "Watermolen",
  station_building: "Stationsgebouw",
  lock_keeper_house: "Sluiswachterswoning",
  level_crossing_house: "Wachtershuisje (spoorweg)",
  lighthouse: "Vuurtoren",
  chapel: "Kapel",
  monastery: "Klooster",
  other: "Overig",
  unknown: "Onbekend",
};

export const SPECIAL_OBJECT_LABELS: Record<string, string> = {
  mill: "Molen",
  watermill: "Watermolen",
  station_building: "Stationsgebouw",
  lock_keeper_house: "Sluiswachterswoning",
  level_crossing_house: "Wachtershuisje",
  lighthouse: "Vuurtoren",
  chapel: "Kapel",
  monastery: "Klooster",
  other: "Bijzonder object",
};

export const RENOVATION_STATUS_LABELS: Record<string, string> = {
  ruin: "Ruïne",
  needs_renovation: "Te renoveren",
  partial_renovation: "Gedeeltelijk gerenoveerd",
  move_in_ready: "Instapklaar",
  unknown: "Onbekend",
};

export const UTILITY_LABELS: Record<string, string> = {
  present: "Aanwezig",
  likely: "Waarschijnlijk aanwezig",
  absent: "Afwezig",
  unknown: "Onbekend",
};

export const COUNTRY_LABELS: Record<string, string> = {
  FR: "Frankrijk",
  BE: "België",
  DE: "Duitsland",
  NL: "Nederland",
};

export const AVAILABILITY_LABELS: Record<string, string> = {
  for_sale: "Te koop",
  under_offer: "Onder bod",
  sold: "Verkocht",
  withdrawn: "Teruggetrokken",
  unknown: "Onbekend",
};

export const SOURCE_STATUS_LABELS: Record<string, string> = {
  active: "Actief",
  paused: "Gepauzeerd",
  blocked: "Geblokkeerd",
  retired: "Uitgefaseerd",
  pending_review: "In beoordeling",
};

export const LEGAL_STATUS_LABELS: Record<string, string> = {
  green: "Groen",
  amber: "Oranje",
  red: "Rood",
  pending_review: "In beoordeling",
};

export function label(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return "—";
  return map[key] ?? key;
}
