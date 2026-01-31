import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Price IDs for lead recovery - these are LEAD-SPECIFIC prices at 50% off ($49.99)
// Standard new order price IDs are different (price_1SvRTtGax2m9otRw75yrsjxS is $99.99)
// Lead recovery should use the discounted price directly
const LEAD_PRICE_ID = "price_1SvRTtGax2m9otRw75yrsjxS"; // $99.99 base (50% off promo applied = $49.99)

// Promo code scheduling (PST timezone)
function getCurrentPromoCode(): string {
  const now = new Date();
  const pstFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const pstDateParts = pstFormatter.formatToParts(now);
  const month = parseInt(pstDateParts.find(p => p.type === "month")?.value || "0");
  const day = parseInt(pstDateParts.find(p => p.type === "day")?.value || "0");
  
  // Valentine's promo runs until Feb 14, then switches to WELCOME50
  if (month === 2 && day <= 14) {
    return "VALENTINES50";
  }
  return "WELCOME50";
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
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Get current promo code
    const currentPromo = getCurrentPromoCode();
    
    // Build discount array - always apply current promo
    const discounts: { coupon?: string; promotion_code?: string }[] = [];
    
    // Look up promotion code ID for current promo
    try {
      const promoCodes = await stripe.promotionCodes.list({
        code: currentPromo,
        active: true,
        limit: 1,
      });
      if (promoCodes.data.length > 0) {
        discounts.push({ promotion_code: promoCodes.data[0].id });
      }
    } catch (e) {
      console.log("Could not find promo code:", currentPromo, e);
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
