import { describe, it, expect } from "vitest";
import {
  computeOfferPricing,
  shouldShowUrgencyBanner,
  shouldShowExpiredNotice,
  formatUsd,
  MEMORY_PACKAGE_CENTS,
} from "../previewOffer";

describe("computeOfferPricing", () => {
  it("normal lead: $29 unchecked", () => {
    const p = computeOfferPricing({});
    expect(p.baseCents).toBe(2900);
    expect(p.addOnCents).toBe(0);
    expect(p.totalCents).toBe(2900);
    expect(p.targetedPriceActive).toBe(false);
  });

  it("normal lead: $29 + $24 add-on = $53", () => {
    const p = computeOfferPricing({ packageSelected: true });
    expect(p.baseCents).toBe(2900);
    expect(p.addOnCents).toBe(MEMORY_PACKAGE_CENTS);
    expect(p.totalCents).toBe(5300);
  });

  it("targeted promo lead: $24 unchecked", () => {
    const p = computeOfferPricing({
      targetedPromoEligible: true,
      targetedPromoPriceCents: 2400,
    });
    expect(p.baseCents).toBe(2400);
    expect(p.totalCents).toBe(2400);
    expect(p.targetedPriceActive).toBe(true);
  });

  it("targeted promo lead: $24 + $24 add-on = $48", () => {
    const p = computeOfferPricing({
      targetedPromoEligible: true,
      targetedPromoPriceCents: 2400,
      packageSelected: true,
    });
    expect(p.baseCents).toBe(2400);
    expect(p.addOnCents).toBe(2400);
    expect(p.totalCents).toBe(4800);
  });

  it("followup behaviour unchanged: $19, and $43 with add-on", () => {
    expect(computeOfferPricing({ isFollowup: true }).totalCents).toBe(1900);
    expect(
      computeOfferPricing({ isFollowup: true, packageSelected: true }).totalCents,
    ).toBe(4300);
  });

  it("sitewide promo acts as a floor on the default ladder", () => {
    expect(computeOfferPricing({ sitewidePromoLeadPriceCents: 2599 }).baseCents).toBe(2599);
    expect(computeOfferPricing({ sitewidePromoLeadPriceCents: 3999 }).baseCents).toBe(2900);
    // followup ($19) stays cheaper than a $25.99 sitewide sale
    expect(
      computeOfferPricing({ isFollowup: true, sitewidePromoLeadPriceCents: 2599 }).baseCents,
    ).toBe(1900);
  });

  it("targeted price wins over followup and sitewide", () => {
    const p = computeOfferPricing({
      targetedPromoEligible: true,
      targetedPromoPriceCents: 2400,
      isFollowup: true,
      sitewidePromoLeadPriceCents: 2599,
    });
    expect(p.baseCents).toBe(2400);
  });

  it("eligible flag without a price falls back to the default ladder", () => {
    const p = computeOfferPricing({ targetedPromoEligible: true, targetedPromoPriceCents: null });
    expect(p.baseCents).toBe(2900);
    expect(p.targetedPriceActive).toBe(false);
  });

  it("total always equals base + add-on (CTA parity)", () => {
    for (const isFollowup of [false, true]) {
      for (const packageSelected of [false, true]) {
        const p = computeOfferPricing({ isFollowup, packageSelected });
        expect(p.totalCents).toBe(p.baseCents + p.addOnCents);
      }
    }
  });
});

describe("shouldShowUrgencyBanner", () => {
  it("hidden when the targeted promo has show_banner=false", () => {
    expect(
      shouldShowUrgencyBanner({
        targetedPromoEligible: true,
        targetedPromoPriceCents: 2400,
        targetedPromoShowBanner: false,
      }),
    ).toBe(false);
  });

  it("hidden when the flag is missing entirely (fail closed)", () => {
    expect(
      shouldShowUrgencyBanner({ targetedPromoEligible: true, targetedPromoPriceCents: 2400 }),
    ).toBe(false);
  });

  it("shown when the promo explicitly allows a banner", () => {
    expect(
      shouldShowUrgencyBanner({
        targetedPromoEligible: true,
        targetedPromoPriceCents: 2400,
        targetedPromoShowBanner: true,
      }),
    ).toBe(true);
  });

  it("hidden for non-eligible leads and when no price is present", () => {
    expect(shouldShowUrgencyBanner({ targetedPromoShowBanner: true })).toBe(false);
    expect(
      shouldShowUrgencyBanner({ targetedPromoEligible: true, targetedPromoShowBanner: true }),
    ).toBe(false);
  });

  it("legacy flash20 fields still work when banners are allowed", () => {
    expect(
      shouldShowUrgencyBanner({
        flash20Eligible: true,
        flash20PriceCents: 1900,
        targetedPromoShowBanner: true,
      }),
    ).toBe(true);
  });
});

describe("shouldShowExpiredNotice", () => {
  it("suppressed for banner-less promos", () => {
    expect(
      shouldShowExpiredNotice({ targetedPromoExpired: true, targetedPromoShowBanner: false }),
    ).toBe(false);
  });

  it("shown for banner-enabled promos", () => {
    expect(
      shouldShowExpiredNotice({ targetedPromoExpired: true, targetedPromoShowBanner: true }),
    ).toBe(true);
  });
});

describe("formatUsd", () => {
  it("formats cents as USD", () => {
    expect(formatUsd(2400)).toBe("$24.00");
    expect(formatUsd(5300)).toBe("$53.00");
  });
});
