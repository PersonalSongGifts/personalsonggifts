import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CheckoutInput {
  pricingTier: "standard" | "priority";
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
  };
}

const PRICE_IDS = {
  standard: "price_1SvRTtGax2m9otRw75yrsjxS",  // $99.99
  priority: "price_1SvRUXGax2m9otRwZOb1lNHD",  // $159.99
};

// Promo code *names* (Stripe Promotion Code "code" field)
// We look up the corresponding promo_ id at runtime to avoid hard-coding IDs that can change.
const PROMO_CODE_NAMES = {
  VALENTINES50: "VALENTINES50",
  WELCOME50: "WELCOME50",
} as const;

// Get the active promo code name based on PST time
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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { pricingTier, formData }: CheckoutInput = await req.json();

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

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil",
    });

    // Get origin for redirect URLs
    const origin = req.headers.get("origin") || "https://personalsonggifts.lovable.app";

    // Store form data in metadata (Stripe limits metadata values to 500 chars each)
    // We'll store the essential data that we need to create the order
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

    // Add optional fields if present
    if (formData.specialMessage) {
      metadata.specialMessage = formData.specialMessage.substring(0, 500);
    }
    if (formData.phoneNumber) {
      metadata.customerPhone = formData.phoneNumber;
    }

    // Get the active promo code based on current date
    const activePromoCodeName = getActivePromoCodeName();
    const activePromoCodeId = await findPromotionCodeIdByCode(stripe, activePromoCodeName);

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer_email: formData.yourEmail,
      line_items: [
        {
          price: PRICE_IDS[pricingTier],
          quantity: 1,
        },
      ],
      mode: "payment",
      // If promo lookup fails, proceed without discount rather than blocking all orders.
      // (We'll log to help you catch misconfiguration quickly.)
      discounts: activePromoCodeId
        ? [{ promotion_code: activePromoCodeId }]
        : undefined,
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout`,
      metadata,
      payment_intent_data: {
        metadata,
      },
    });

    if (!activePromoCodeId) {
      console.warn(
        `Promo code lookup failed for '${activePromoCodeName}'. Checkout created WITHOUT discount. session=${session.id}`,
      );
    }

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
