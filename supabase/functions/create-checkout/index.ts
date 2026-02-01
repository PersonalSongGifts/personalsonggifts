import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CheckoutInput {
  pricingTier: "standard" | "priority";
  promoCode?: string;
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

// Known promo codes with their discount percentages
const PROMO_CODES: Record<string, number> = {
  "VALENTINES50": 50,
  "WELCOME50": 50,
  "HYPERDRIVETEST": 100, // Free for testing
  "FRIEND20": 20,
  "VIP75": 75,
};

// Base prices in cents
const BASE_PRICES: Record<CheckoutInput["pricingTier"], number> = {
  standard: 9999,  // $99.99
  priority: 15999, // $159.99
};

// Calculate discounted price based on promo code
function getDiscountedPrice(tier: CheckoutInput["pricingTier"], promoCode?: string): number {
  const basePrice = BASE_PRICES[tier];
  const discount = promoCode && PROMO_CODES[promoCode.toUpperCase()] 
    ? PROMO_CODES[promoCode.toUpperCase()] 
    : 50; // Default 50% off
  
  return Math.round(basePrice * (1 - discount / 100));
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

    const { pricingTier, formData, promoCode }: CheckoutInput = await req.json();

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

    const unitAmount = getDiscountedPrice(pricingTier, promoCode);
    const productName = pricingTier === "priority" ? "Priority Song" : "Standard Song";

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer_email: formData.yourEmail,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: productName,
            },
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
