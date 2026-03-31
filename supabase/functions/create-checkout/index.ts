import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CheckoutInput {
  pricingTier: "standard" | "priority";
  promoCode?: string;
  promoSlug?: string;
  additionalPromoCode?: string;
  formData: {
    recipientType: string;
    recipientName: string;
    occasion: string;
    genre: string;
    singerPreference: string;
    specialQualities: string;
    favoriteMemory: string;
    specialMessage?: string;
    yourName: string;
    yourEmail: string;
    phoneNumber?: string;
    lyricsLanguageCode?: string;
    smsOptIn?: boolean;
    phoneE164?: string;
    timezone?: string;
  };
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
}

// Hardcoded test codes (100% off overrides — skip payment entirely)
// NOTE: ADMINTEST99 is intentionally NOT here so it goes through real payment processing
const FREE_TEST_CODES: Record<string, boolean> = {
  "HYPERDRIVETEST": true,
  "HYPERDRIVEFREE2026": true,
  "HYPERDRIVEFREE2026!": true,
  "BRIANNAWARREN": true,
  "INFLCR-SPARK-7X": true,
  "INFLCR-WAVE-3K": true,
  "INFLCR-GLOW-9M": true,
  "INFLCR-RISE-5Q": true,
};

// Hardcoded discount codes that go through real payment (not free)
const DISCOUNT_TEST_CODES: Record<string, number> = {
  "ADMINTEST99": 99, // 99% off — ~$0.50 charge for testing payment flow
};

// Codes with a usage limit tracked in admin_settings
const LIMITED_CODES: Record<string, { maxUses: number; settingsKey: string }> = {
  "BRIANNAWARREN": { maxUses: 5, settingsKey: "briannawarren_usage_count" },
  "INFLCR-SPARK-7X": { maxUses: 1, settingsKey: "inflcr_spark_7x_usage_count" },
  "INFLCR-WAVE-3K": { maxUses: 1, settingsKey: "inflcr_wave_3k_usage_count" },
  "INFLCR-GLOW-9M": { maxUses: 1, settingsKey: "inflcr_glow_9m_usage_count" },
  "INFLCR-RISE-5Q": { maxUses: 1, settingsKey: "inflcr_rise_5q_usage_count" },
};

// Base prices in cents
const BASE_PRICES: Record<string, number> = {
  standard: 9999,  // $99.99
  priority: 15999, // $159.99
};

// Seasonal discount percentage
const SEASONAL_DISCOUNT_PERCENT = 50;

async function lookupStripeCoupon(stripe: Stripe, code: string): Promise<Stripe.Coupon | null> {
  const upperCode = code.trim().toUpperCase();
  
  try {
    // Try retrieving by ID (original case, then uppercase)
    try {
      return await stripe.coupons.retrieve(code.trim());
    } catch {
      try {
        return await stripe.coupons.retrieve(upperCode);
      } catch {
        // Not found by ID
      }
    }

    // Search by listing
    const coupons = await stripe.coupons.list({ limit: 100 });
    const found = coupons.data.find(
      (c) => c.name?.toUpperCase() === upperCode || c.id.toUpperCase() === upperCode
    );
    return found && found.valid ? found : null;
  } catch {
    return null;
  }
}

function calculateFinalPrice(
  tier: string,
  additionalPromoCode?: string,
  stripeCoupon?: Stripe.Coupon | null
): number {
  const basePrice = BASE_PRICES[tier] || BASE_PRICES.standard;

  // Step 1: Apply seasonal discount using integer arithmetic to avoid float drift.
  // Example: 9999 * (100 - 50) / 100 = 9999 * 50 / 100 = 499950 / 100 = 4999.5 → floor → 4999 ($49.99)
  const afterSeasonal = Math.floor(basePrice * (100 - SEASONAL_DISCOUNT_PERCENT) / 100);

  // Step 2: If additional promo, apply on top using same integer pattern
  if (stripeCoupon) {
    if (stripeCoupon.percent_off) {
      const afterAdditional = Math.floor(afterSeasonal * (100 - stripeCoupon.percent_off) / 100);
      return Math.max(0, afterAdditional);
    } else if (stripeCoupon.amount_off) {
      // amount_off is in cents
      return Math.max(0, afterSeasonal - stripeCoupon.amount_off);
    }
  }

  return afterSeasonal;
}

function buildMetadata(input: CheckoutInput): Record<string, string> {
  const { pricingTier, formData, utmSource, utmMedium, utmCampaign, utmContent, utmTerm } = input;
  
  const metadata: Record<string, string> = {
    pricingTier,
    recipientType: formData.recipientType,
    recipientName: formData.recipientName.substring(0, 500),
    occasion: formData.occasion,
    genre: formData.genre,
    singerPreference: formData.singerPreference,
    specialQualities: formData.specialQualities.substring(0, 500),
    favoriteMemory: formData.favoriteMemory.substring(0, 500),
    customerName: formData.yourName.substring(0, 500),
    customerEmail: formData.yourEmail,
  };

  if (formData.specialMessage) metadata.specialMessage = formData.specialMessage.substring(0, 500);
  if (formData.phoneNumber) metadata.customerPhone = formData.phoneNumber;
  if (formData.lyricsLanguageCode) metadata.lyricsLanguageCode = formData.lyricsLanguageCode;
  if (formData.smsOptIn) metadata.smsOptIn = "true";
  if (formData.phoneE164) metadata.phoneE164 = formData.phoneE164;
  if (formData.timezone) metadata.timezone = formData.timezone;
  if (utmSource) metadata.utmSource = utmSource;
  if (utmMedium) metadata.utmMedium = utmMedium;
  if (utmCampaign) metadata.utmCampaign = utmCampaign;
  if (utmContent) metadata.utmContent = utmContent;
  if (utmTerm) metadata.utmTerm = utmTerm;

  return metadata;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const input: CheckoutInput = await req.json();
    const { pricingTier, formData, additionalPromoCode } = input;

    // Validate tier
    if (!["standard", "priority"].includes(pricingTier)) {
      return new Response(
        JSON.stringify({ error: "Invalid pricing tier" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate required form data
    if (!formData || !formData.yourEmail || !formData.recipientName) {
      return new Response(
        JSON.stringify({ error: "Missing required form data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Stripe
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: "STRIPE_SECRET_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (stripeKey.startsWith("pk_")) {
      return new Response(
        JSON.stringify({ error: "Invalid STRIPE_SECRET_KEY (publishable key provided)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const origin = req.headers.get("origin") || "https://personalsonggifts.lovable.app";
    const metadata: Record<string, string> = buildMetadata(input);

    // Determine unit amount
    let unitAmount: number;
    const upperAdditional = additionalPromoCode?.trim().toUpperCase() || "";

    // Check for free test codes (100% override - applies to the additional code)
    if (FREE_TEST_CODES[upperAdditional]) {
      // Check usage limit if applicable
      const limit = LIMITED_CODES[upperAdditional];
      if (limit) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        const { data } = await supabase
          .from("admin_settings")
          .select("value")
          .eq("key", limit.settingsKey)
          .maybeSingle();
        const currentUses = parseInt(data?.value || "0", 10);
        if (currentUses >= limit.maxUses) {
          return new Response(
            JSON.stringify({ error: "This promo code has reached its usage limit" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // Increment usage count
        await supabase
          .from("admin_settings")
          .update({ value: String(currentUses + 1), updated_at: new Date().toISOString() })
          .eq("key", limit.settingsKey);
      }

      unitAmount = 0;
      metadata.promoCode = upperAdditional;
      metadata.amount_total_cents = "0";
    } else if (DISCOUNT_TEST_CODES[upperAdditional]) {
      // Hardcoded discount codes (e.g. ADMINTEST99 = 99% off) — goes through real payment
      const discountPercent = DISCOUNT_TEST_CODES[upperAdditional];
      const basePrice = BASE_PRICES[pricingTier] || BASE_PRICES.standard;
      const afterSeasonal = Math.floor(basePrice * (100 - SEASONAL_DISCOUNT_PERCENT) / 100);
      unitAmount = Math.max(1, Math.floor(afterSeasonal * (100 - discountPercent) / 100));
      metadata.additionalPromoCode = upperAdditional;
      metadata.amount_total_cents = String(unitAmount);
    } else {
      // Look up additional coupon in Stripe if provided
      let stripeCoupon: Stripe.Coupon | null = null;
      if (upperAdditional && upperAdditional !== "VALENTINES50" && upperAdditional !== "WELCOME50") {
        stripeCoupon = await lookupStripeCoupon(stripe, upperAdditional);
        if (stripeCoupon) {
          metadata.additionalPromoCode = upperAdditional;
        }
      }

      unitAmount = calculateFinalPrice(pricingTier, upperAdditional, stripeCoupon);
      metadata.amount_total_cents = String(unitAmount);
    }

    const productName = pricingTier === "priority" ? "Priority Song" : "Standard Song";

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer_email: formData.yourEmail,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: productName },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout`,
      metadata,
      payment_intent_data: {
        metadata,
      },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Checkout error:", error);
    const message = error instanceof Error ? error.message : "Failed to create checkout session";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
