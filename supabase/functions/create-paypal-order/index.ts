import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CheckoutInput {
  pricingTier: "standard" | "priority";
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

// Hardcoded test codes (100% off overrides)
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
  standard: 9999,
  priority: 15999,
};

const SEASONAL_DISCOUNT_PERCENT = 50;

async function getPayPalAccessToken(): Promise<string> {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID")!;
  const secretKey = Deno.env.get("PAYPAL_SECRET_KEY")!;
  const auth = btoa(`${clientId}:${secretKey}`);

  const response = await fetch("https://api-m.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`PayPal auth failed: ${err}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Look up a Stripe coupon for stacking (reuses same logic as create-checkout)
async function lookupStripeCoupon(code: string): Promise<{ percent_off?: number; amount_off?: number } | null> {
  // We import Stripe dynamically only if needed
  const Stripe = (await import("npm:stripe@18.5.0")).default;
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
  if (!stripeKey) return null;
  
  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const upperCode = code.trim().toUpperCase();

  try {
    let coupon;
    try { coupon = await stripe.coupons.retrieve(code.trim()); } catch { /* noop */ }
    if (!coupon) {
      try { coupon = await stripe.coupons.retrieve(upperCode); } catch { /* noop */ }
    }
    if (!coupon) {
      const coupons = await stripe.coupons.list({ limit: 100 });
      coupon = coupons.data.find(
        (c: any) => c.name?.toUpperCase() === upperCode || c.id.toUpperCase() === upperCode
      );
    }
    if (!coupon || !coupon.valid) return null;
    return { percent_off: coupon.percent_off ?? undefined, amount_off: coupon.amount_off ?? undefined };
  } catch {
    return null;
  }
}

function calculateFinalPriceCents(
  tier: string,
  stripeCoupon?: { percent_off?: number; amount_off?: number } | null
): number {
  const basePrice = BASE_PRICES[tier] || BASE_PRICES.standard;
  const afterSeasonal = Math.floor(basePrice * (100 - SEASONAL_DISCOUNT_PERCENT) / 100);

  if (stripeCoupon) {
    if (stripeCoupon.percent_off) {
      return Math.max(0, Math.floor(afterSeasonal * (100 - stripeCoupon.percent_off) / 100));
    } else if (stripeCoupon.amount_off) {
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

    if (!["standard", "priority"].includes(pricingTier)) {
      return new Response(
        JSON.stringify({ error: "Invalid pricing tier" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!formData || !formData.yourEmail || !formData.recipientName) {
      return new Response(
        JSON.stringify({ error: "Missing required form data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const upperAdditional = additionalPromoCode?.trim().toUpperCase() || "";
    const metadata = buildMetadata(input);
    let unitAmountCents: number;

    // Handle free test codes
    if (FREE_TEST_CODES[upperAdditional]) {
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
        // Don't increment yet — increment on capture
      }
      unitAmountCents = 0;
      metadata.promoCode = upperAdditional;
      metadata.amount_total_cents = "0";
    } else if (DISCOUNT_TEST_CODES[upperAdditional]) {
      const discountPercent = DISCOUNT_TEST_CODES[upperAdditional];
      const basePrice = BASE_PRICES[pricingTier] || BASE_PRICES.standard;
      const afterSeasonal = Math.floor(basePrice * (100 - SEASONAL_DISCOUNT_PERCENT) / 100);
      unitAmountCents = Math.max(1, Math.floor(afterSeasonal * (100 - discountPercent) / 100));
      metadata.additionalPromoCode = upperAdditional;
      metadata.amount_total_cents = String(unitAmountCents);
    } else {
      let stripeCoupon: { percent_off?: number; amount_off?: number } | null = null;
      if (upperAdditional && upperAdditional !== "VALENTINES50" && upperAdditional !== "WELCOME50") {
        stripeCoupon = await lookupStripeCoupon(upperAdditional);
        if (stripeCoupon) {
          metadata.additionalPromoCode = upperAdditional;
        }
      }
      unitAmountCents = calculateFinalPriceCents(pricingTier, stripeCoupon);
      metadata.amount_total_cents = String(unitAmountCents);
    }

    const unitAmountDollars = (unitAmountCents / 100).toFixed(2);
    const productName = pricingTier === "priority" ? "Priority Song" : "Standard Song";

    // Get PayPal access token
    const accessToken = await getPayPalAccessToken();

    // Create PayPal order
    const paypalResponse = await fetch("https://api-m.paypal.com/v2/checkout/orders", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "USD",
              value: unitAmountDollars,
            },
            description: `${productName} for ${formData.recipientName}`,
          },
        ],
        application_context: {
          brand_name: "Personal Song Gifts",
          user_action: "PAY_NOW",
          return_url: "https://personalsonggifts.lovable.app/payment-success",
          cancel_url: "https://personalsonggifts.lovable.app/checkout",
        },
      }),
    });

    if (!paypalResponse.ok) {
      const err = await paypalResponse.text();
      console.error("PayPal create order error:", err);
      throw new Error("Failed to create PayPal order");
    }

    const paypalOrder = await paypalResponse.json();

    // Store metadata in a temporary record so capture can access it
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Store in admin_settings with TTL-like key
    await supabase
      .from("admin_settings")
      .upsert({
        key: `paypal_order:${paypalOrder.id}`,
        value: JSON.stringify(metadata),
        updated_at: new Date().toISOString(),
      });

    return new Response(
      JSON.stringify({ orderID: paypalOrder.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("PayPal create order error:", error);
    const message = error instanceof Error ? error.message : "Failed to create PayPal order";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
