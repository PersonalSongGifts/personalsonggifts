/**
 * Pure display helpers for the lead preview offer card.
 *
 * These helpers ONLY decide what the customer sees. The amount actually charged
 * is always recomputed server-side in `create-lead-checkout` from the preview
 * token; nothing here influences Stripe, PayPal, webhooks or order recording.
 */

/** The optional keepsake add-on price. Mirrors FOREVER_MEMORY_PACKAGE_CENTS. */
export const MEMORY_PACKAGE_CENTS = 2400;

export const LEAD_BASE_CENTS = 2900;
export const FOLLOWUP_DISCOUNT_CENTS = 1000;

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export interface OfferPricingInput {
  /** Targeted (per-lead) promo price, when the server says this lead is eligible. */
  targetedPromoEligible?: boolean;
  targetedPromoPriceCents?: number | null;
  /** Sitewide promo lead price, acts as a floor on the default ladder. */
  sitewidePromoLeadPriceCents?: number | null;
  /** True when the link carries ?followup=true. */
  isFollowup?: boolean;
  /** Whether the customer selected the optional add-on. */
  packageSelected?: boolean;
}

export interface OfferPricing {
  baseCents: number;
  addOnCents: number;
  totalCents: number;
  /** True when a targeted promo price is in effect for this lead. */
  targetedPriceActive: boolean;
}

/**
 * Compute the displayed base / add-on / total, using exactly the same ladder the
 * server uses: targeted promo price wins, otherwise the default (minus the
 * follow-up discount when applicable) floored by any sitewide promo price.
 */
export function computeOfferPricing(input: OfferPricingInput): OfferPricing {
  const targetedPriceActive =
    input.targetedPromoEligible === true &&
    typeof input.targetedPromoPriceCents === "number";

  const baseDefaultCents = input.isFollowup
    ? LEAD_BASE_CENTS - FOLLOWUP_DISCOUNT_CENTS
    : LEAD_BASE_CENTS;

  const sitewide = input.sitewidePromoLeadPriceCents;
  const effectiveDefaultCents =
    typeof sitewide === "number" ? Math.min(baseDefaultCents, sitewide) : baseDefaultCents;

  const baseCents = targetedPriceActive
    ? (input.targetedPromoPriceCents as number)
    : effectiveDefaultCents;

  const addOnCents = input.packageSelected ? MEMORY_PACKAGE_CENTS : 0;

  return {
    baseCents,
    addOnCents,
    totalCents: baseCents + addOnCents,
    targetedPriceActive,
  };
}

export interface UrgencyBannerInput {
  targetedPromoEligible?: boolean;
  targetedPromoExpired?: boolean;
  targetedPromoPriceCents?: number | null;
  /** Server-provided promo flag; only `true` permits the urgency banner. */
  targetedPromoShowBanner?: boolean;
  // Legacy response fields from older bundles/responses.
  flash20Eligible?: boolean;
  flash20Expired?: boolean;
  flash20PriceCents?: number | null;
}

/**
 * Decide whether the generic urgency banner may be rendered. A targeted promo
 * configured with show_banner=false must never produce urgency messaging —
 * while still keeping its price and eligibility untouched.
 */
export function shouldShowUrgencyBanner(input: UrgencyBannerInput): boolean {
  const eligible = input.targetedPromoEligible === true || input.flash20Eligible === true;
  const priceCents = input.targetedPromoPriceCents ?? input.flash20PriceCents ?? null;
  if (!eligible || typeof priceCents !== "number") return false;
  return input.targetedPromoShowBanner === true;
}

/** "Sale ended" notice follows the same suppression rule as the live banner. */
export function shouldShowExpiredNotice(input: UrgencyBannerInput): boolean {
  const expired = input.targetedPromoExpired === true || input.flash20Expired === true;
  if (!expired) return false;
  return input.targetedPromoShowBanner === true;
}
