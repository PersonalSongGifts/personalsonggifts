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
    relationship: string;
    specialQualities: string;
    favoriteMemory: string;
    specialMessage?: string;
    yourName: string;
    yourEmail: string;
    phoneNumber?: string;
  };
}

const PRICE_IDS = {
  standard: "price_1Sty7MGax2m9otRw5WBP7Wto",
  priority: "price_1Sty7hGax2m9otRwGKt6AAbP",
};

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
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
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
      relationship: formData.relationship.substring(0, 500),
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
