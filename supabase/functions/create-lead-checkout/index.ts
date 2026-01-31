import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Lead recovery uses the standard $99.99 price, with the same site-wide promo code
// auto-applied to bring it down to the discounted offer.
const LEAD_PRICE_ID = "price_1SvRTtGax2m9otRw75yrsjxS"; // $99.99 base

// Promo code *names* (Stripe Promotion Code "code" field)
// We look up the corresponding promo_ id at runtime to avoid hard-coding IDs that can change.
const PROMO_CODE_NAMES = {
  VALENTINES50: "VALENTINES50",
  WELCOME50: "WELCOME50",
} as const;

// Get the active promo code name based on PST time (must match the main checkout function)
function getActivePromoCodeName(): string {
  // Feb 15, 2026 at 1:00 AM PST (UTC-8)
  const switchDate = new Date("2026-02-15T09:00:00.000Z"); // 1 AM PST = 9 AM UTC
  const now = new Date();
  return now < switchDate ? PROMO_CODE_NAMES.VALENTINES50 : PROMO_CODE_NAMES.WELCOME50;
}

async function findPromotionCodeIdByCode(stripe: Stripe, code: string): Promise<string | null> {
  try {
    const promoCodes = await stripe.promotionCodes.list({
      code,
      active: true,
      limit: 1,
    });
    return promoCodes.data?.[0]?.id ?? null;
  } catch (e) {
    console.error("Failed to lookup promotion code:", code, e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { previewToken, applyFollowupDiscount } = await req.json();

    if (!previewToken || previewToken.length < 16) {
      return new Response(
        JSON.stringify({ error: "Invalid preview token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find lead by preview token
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, email, customer_name, recipient_name, recipient_type, occasion, genre, singer_preference, special_qualities, favorite_memory, special_message, status, full_song_url")
      .eq("preview_token", previewToken)
      .single();

    if (leadError || !lead) {
      console.error("Lead not found:", leadError);
      return new Response(
        JSON.stringify({ error: "Preview not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (lead.status === "converted") {
      return new Response(
        JSON.stringify({ error: "Already purchased" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!lead.full_song_url) {
      return new Response(
        JSON.stringify({ error: "Song not ready" }),
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

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil",
    });

    // Always apply the same site-wide promo code used by the main checkout
    const activePromoCodeName = getActivePromoCodeName();
    const activePromoCodeId = await findPromotionCodeIdByCode(stripe, activePromoCodeName);
    const discounts: { coupon?: string; promotion_code?: string }[] = [];
    if (activePromoCodeId) {
      discounts.push({ promotion_code: activePromoCodeId });
    } else {
      console.warn(
        `Promo code lookup failed for '${activePromoCodeName}'. Checkout will proceed WITHOUT site-wide discount.`,
      );
    }

    // If follow-up discount applies, add FULLSONG coupon ($5 off)
    if (applyFollowupDiscount) {
      try {
        const promoCodes = await stripe.promotionCodes.list({
          code: "FULLSONG",
          active: true,
          limit: 1,
        });
        if (promoCodes.data.length > 0) {
          discounts.push({ promotion_code: promoCodes.data[0].id });
        }
      } catch (e) {
        console.log("Could not find FULLSONG promo:", e);
      }
    }

    // Get origin for redirect URLs
    const origin = req.headers.get("origin") || "https://personalsonggifts.lovable.app";

    // Create Stripe checkout session - leads only get standard pricing
    const session = await stripe.checkout.sessions.create({
      customer_email: lead.email,
      line_items: [
        {
          price: LEAD_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: "payment",
      discounts: discounts.length > 0 ? discounts : undefined,
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&source=lead`,
      cancel_url: `${origin}/preview/${previewToken}`,
      metadata: {
        source: "lead",
        leadId: lead.id,
        previewToken: previewToken,
        pricingTier: "standard",
        customerName: lead.customer_name,
        customerEmail: lead.email,
        recipientType: lead.recipient_type,
        recipientName: lead.recipient_name,
        occasion: lead.occasion,
        genre: lead.genre,
        singerPreference: lead.singer_preference,
        specialQualities: lead.special_qualities,
        favoriteMemory: lead.favorite_memory,
        specialMessage: lead.special_message || "",
      },
    });

    console.log(`Created lead checkout session for ${lead.id}: ${session.id}`);

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Create lead checkout error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
