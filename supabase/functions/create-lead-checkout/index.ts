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
    const { previewToken, applyFollowupDiscount, applyVday10Discount, promoSlug } = await req.json();

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

    let unitAmount: number;
    let allowPromotionCodes = true;

    if (promoSlug) {
      // Frontend sent a promo slug — fetch + validate
      const { data: promo } = await supabase
        .from("promotions")
        .select("*")
        .eq("slug", promoSlug)
        .maybeSingle();

      if (!promo) {
        return new Response(
          JSON.stringify({ error: "promo_not_eligible" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const now = new Date();
      const starts = new Date(promo.starts_at);
      const ends = new Date(promo.ends_at);

      // Distinguish expired (clock ran out) from not-yet-active / inactive
      if (now > ends) {
        return new Response(
          JSON.stringify({ error: "promo_expired" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!promo.is_active || now < starts) {
        return new Response(
          JSON.stringify({ error: "promo_not_eligible" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // For TARGETED promos (e.g. flash20), require this lead to actually have received the email
      if (promo.targeted === true) {
        const eventType = `${promoSlug}_sent`;
        const { data: logEntry } = await supabase
          .from("order_activity_log")
          .select("id")
          .eq("entity_type", "lead")
          .eq("entity_id", lead.id)
          .eq("event_type", eventType)
          .limit(1)
          .maybeSingle();

        if (!logEntry) {
          console.log(`Lead ${lead.id} attempted ${promoSlug} but has no ${eventType} log entry`);
          return new Response(
            JSON.stringify({ error: "promo_not_eligible" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Promo price takes TOTAL precedence — ignore followup and vday10
      unitAmount = promo.lead_price_cents;
      allowPromotionCodes = false;
    } else {
      unitAmount = applyFollowupDiscount
        ? LEAD_STANDARD_FOLLOWUP_TOTAL_CENTS
        : LEAD_STANDARD_TOTAL_CENTS;

      // VDay10: subtract $10 server-side when remarketing link is used
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

      // Sitewide (non-targeted) active promo acts as a price FLOOR for all leads.
      // If a sitewide sale (e.g., Early Mother's Day @ $29.99) is cheaper than the
      // computed default/followup/vday price, charge the sitewide price instead.
      // Targeted promoSlug requests above bypass this branch entirely.
      const nowIso = new Date().toISOString();
      const { data: sitewide } = await supabase
        .from("promotions")
        .select("slug, lead_price_cents")
        .eq("is_active", true)
        .eq("targeted", false)
        .lte("starts_at", nowIso)
        .gte("ends_at", nowIso)
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sitewide && typeof (sitewide as { lead_price_cents: number }).lead_price_cents === "number") {
        const sitewideCents = (sitewide as { lead_price_cents: number }).lead_price_cents;
        if (sitewideCents < unitAmount) {
          console.log(`Applying sitewide promo ${(sitewide as { slug: string }).slug}: ${unitAmount} -> ${sitewideCents}`);
          unitAmount = sitewideCents;
        }
      }
    }

    // Get origin for redirect URLs
    const origin = req.headers.get("origin") || "https://personalsonggifts.lovable.app";

    // Create Stripe checkout session - leads only get standard pricing
    const session = await stripe.checkout.sessions.create({
      customer_email: lead.email,
      allow_promotion_codes: allowPromotionCodes,
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
