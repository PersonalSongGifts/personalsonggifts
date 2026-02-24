import Stripe from "npm:stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Hardcoded test codes that bypass Stripe lookup
const TEST_CODES: Record<string, number> = {
  "HYPERDRIVETEST": 100,
  "HYPERDRIVEFREE2026": 100,
  "HYPERDRIVEFREE2026!": 100,
  "BRIANNAWARREN": 100,
};

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

    const { code } = await req.json();
    if (!code || typeof code !== "string") {
      return new Response(
        JSON.stringify({ valid: false, error: "No code provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const upperCode = code.trim().toUpperCase();

    // Check hardcoded test codes first
    if (TEST_CODES[upperCode]) {
      return new Response(
        JSON.stringify({
          valid: true,
          type: "percent_off",
          percent_off: TEST_CODES[upperCode],
          name: upperCode,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Don't allow re-applying the seasonal promo as an additional code
    if (upperCode === "VALENTINES50" || upperCode === "WELCOME50") {
      return new Response(
        JSON.stringify({ valid: false, error: "This promo is already applied automatically" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up in Stripe
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ valid: false, error: "Payment system not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    try {
      // Try to retrieve coupon by ID (Stripe coupon IDs are case-sensitive)
      // Try the original case first, then uppercase
      let coupon;
      try {
        coupon = await stripe.coupons.retrieve(code.trim());
      } catch {
        // Try uppercase
        try {
          coupon = await stripe.coupons.retrieve(upperCode);
        } catch {
          // Not found by ID, try listing by name
          coupon = null;
        }
      }

      // If not found by ID, search by listing coupons
      if (!coupon) {
        const coupons = await stripe.coupons.list({ limit: 100 });
        coupon = coupons.data.find(
          (c) => c.name?.toUpperCase() === upperCode || c.id.toUpperCase() === upperCode
        );
      }

      if (!coupon || !coupon.valid) {
        return new Response(
          JSON.stringify({ valid: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Return discount info
      if (coupon.percent_off) {
        return new Response(
          JSON.stringify({
            valid: true,
            type: "percent_off",
            percent_off: coupon.percent_off,
            name: coupon.name || coupon.id,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else if (coupon.amount_off) {
        return new Response(
          JSON.stringify({
            valid: true,
            type: "amount_off",
            amount_off: coupon.amount_off, // in cents
            currency: coupon.currency || "usd",
            name: coupon.name || coupon.id,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Coupon exists but has no discount info
      return new Response(
        JSON.stringify({ valid: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (stripeError) {
      console.error("Stripe coupon lookup error:", stripeError);
      return new Response(
        JSON.stringify({ valid: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Validate promo code error:", error);
    return new Response(
      JSON.stringify({ valid: false, error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
