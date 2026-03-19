import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// IMPORTANT:
// We set the offer amount server-side so Stripe ALWAYS shows the discounted lead offer,
// even if promo-code configuration changes in Stripe.
const LEAD_STANDARD_TOTAL_CENTS = 4999;
const LEAD_STANDARD_FOLLOWUP_TOTAL_CENTS = 3999; // $10 off follow-up

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { previewToken, applyFollowupDiscount, applyVday10Discount } = await req.json();

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

    let unitAmount = applyFollowupDiscount
      ? LEAD_STANDARD_FOLLOWUP_TOTAL_CENTS
      : LEAD_STANDARD_TOTAL_CENTS;

    // VDay10: subtract $10 server-side when remarketing link is used
    // Gated behind vday10_enabled admin setting
    const VDAY10_DISCOUNT_CENTS = 1000;
    if (applyVday10Discount) {
      const { data: vdaySetting } = await supabase
        .from("admin_settings")
        .select("value")
        .eq("key", "vday10_enabled")
        .maybeSingle();
      const vday10Enabled = (vdaySetting as { value: string } | null)?.value === "true";
      if (vday10Enabled) {
        unitAmount = Math.max(0, unitAmount - VDAY10_DISCOUNT_CENTS);
      } else {
        console.log("VDay10 discount requested but vday10_enabled=false, ignoring");
      }
    }

    // Get origin for redirect URLs
    const origin = req.headers.get("origin") || "https://personalsonggifts.lovable.app";

    // Create Stripe checkout session - leads only get standard pricing
    const session = await stripe.checkout.sessions.create({
      customer_email: lead.email,
      allow_promotion_codes: true,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Full Song (Lead Offer)",
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&source=lead`,
      cancel_url: `${origin}/preview/${previewToken}`,
      metadata: {
        source: "lead",
        leadId: lead.id,
        previewToken: previewToken,
        pricingTier: "standard",
        offerPriceCents: String(unitAmount),
        vday10Applied: applyVday10Discount ? "true" : "false",
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
