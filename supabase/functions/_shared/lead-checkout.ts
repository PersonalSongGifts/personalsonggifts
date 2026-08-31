/**
 * Canonical pricing helpers for the preview-to-purchase flow.
 *
 * Stripe's session total is the payment source of truth. The order ledger
 * stores the base song and the package separately so AOV and fulfilment stay
 * accurate without ever charging an add-on twice.
 */

export const FOREVER_MEMORY_PACKAGE_CENTS = 2400;

export type LeadCheckoutMetadata = Record<string, string | null | undefined>;

export interface LeadCheckoutAmounts {
  baseCents: number;
  packageCents: number;
  totalCents: number;
  hasForeverMemory: boolean;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseCents(value: string | null | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return isNonNegativeInteger(parsed) ? parsed : null;
}

export function hasReadyLeadBonus(lead: { bonus_song_url?: string | null }): boolean {
  return typeof lead.bonus_song_url === "string" && lead.bonus_song_url.trim().length > 0;
}

export function buildLeadCheckoutAmounts(
  baseCents: number,
  includeForeverMemory: boolean,
): LeadCheckoutAmounts {
  if (!isNonNegativeInteger(baseCents)) {
    throw new Error("Lead base price must be a non-negative integer number of cents");
  }

  const packageCents = includeForeverMemory ? FOREVER_MEMORY_PACKAGE_CENTS : 0;
  return {
    baseCents,
    packageCents,
    totalCents: baseCents + packageCents,
    hasForeverMemory: includeForeverMemory,
  };
}

/**
 * Reconstruct the recorded base/add-on split from an already-paid Checkout
 * Session. A malformed total or metadata mismatch is deliberately rejected
 * instead of inventing a price or silently recording the package as free.
 */
export function resolveLeadCheckoutAmounts(
  stripeTotalCents: number | null | undefined,
  metadata: LeadCheckoutMetadata,
): LeadCheckoutAmounts | null {
  const hasForeverMemory = metadata.forever_memory === "true";
  const packageCents = hasForeverMemory ? parseCents(metadata.package_price_cents) : 0;

  if (hasForeverMemory && packageCents !== FOREVER_MEMORY_PACKAGE_CENTS) return null;

  const metadataBaseCents = parseCents(metadata.offerPriceCents);
  const totalCents = isNonNegativeInteger(stripeTotalCents)
    ? stripeTotalCents
    : metadataBaseCents !== null
      ? metadataBaseCents + packageCents
      : null;

  if (totalCents === null || totalCents < packageCents) return null;

  return {
    baseCents: totalCents - packageCents,
    packageCents,
    totalCents,
    hasForeverMemory,
  };
}
