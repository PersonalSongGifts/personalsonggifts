// Shared helper for rendering the dynamic sale banner in lead emails.
// Mirrors the homepage PromoBanner component so customers see the same offer.

import { SupabaseClient } from "npm:@supabase/supabase-js@2.93.1";

export interface PromoBannerData {
  name: string;
  banner_text: string | null;
  banner_emoji: string | null;
  banner_bg_color: string | null;
  banner_text_color: string | null;
  show_banner: boolean;
  standard_price_cents: number;
  lead_price_cents: number | null;
}

export async function getActivePromoForBanner(
  supabase: SupabaseClient,
): Promise<PromoBannerData | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("promotions")
    .select(
      "name, banner_text, banner_emoji, banner_bg_color, banner_text_color, show_banner, standard_price_cents, lead_price_cents",
    )
    .eq("is_active", true)
    .lte("starts_at", nowIso)
    .gte("ends_at", nowIso)
    .limit(1)
    .maybeSingle();

  if (error || !data || !data.show_banner) return null;
  return data as PromoBannerData;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildBannerCopy(promo: PromoBannerData): string {
  const emoji = promo.banner_emoji || "🔥";
  const baseText = promo.banner_text || "Limited Time Sale!";
  const salePrice = promo.lead_price_cents ?? promo.standard_price_cents;
  // Always include actual price so leads see the real number, not just "sale"
  return `${emoji} ${baseText} — Full song just ${formatPrice(salePrice)} (normally $99.99)`;
}

export function renderPromoBannerHtml(promo: PromoBannerData | null): string {
  if (!promo) return "";
  const bg = promo.banner_bg_color || "#1E3A5F";
  const fg = promo.banner_text_color || "#ffffff";
  const copy = buildBannerCopy(promo);
  return `<div style="background-color: ${bg}; color: ${fg}; text-align: center; padding: 12px 16px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 600; line-height: 1.4;">${copy}</div>`;
}

export function renderPromoBannerText(promo: PromoBannerData | null): string {
  if (!promo) return "";
  return `${buildBannerCopy(promo)}\n\n`;
}
