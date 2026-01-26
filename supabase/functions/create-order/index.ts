import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrderInput {
  pricingTier: "standard" | "priority";
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  recipientType: string;
  recipientName: string;
  occasion: string;
  genre: string;
  singerPreference: string;
  relationship: string;
  specialQualities: string;
  favoriteMemory: string;
  specialMessage?: string;
  deviceType?: string;
}

// Validation functions
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

function validateString(value: string, maxLength: number): boolean {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function validateOptionalString(value: string | undefined, maxLength: number): boolean {
  if (!value) return true;
  return typeof value === "string" && value.length <= maxLength;
}

function validateOrderInput(input: OrderInput): { valid: boolean; error?: string } {
  if (!validateString(input.customerName, 100)) {
    return { valid: false, error: "Customer name is required and must be less than 100 characters" };
  }
  
  if (!validateEmail(input.customerEmail)) {
    return { valid: false, error: "Valid email address is required" };
  }
  
  if (!validateOptionalString(input.customerPhone, 20)) {
    return { valid: false, error: "Phone number must be less than 20 characters" };
  }
  
  if (!validateString(input.recipientType, 50)) {
    return { valid: false, error: "Recipient type is required" };
  }
  
  if (!validateString(input.recipientName, 100)) {
    return { valid: false, error: "Recipient name is required and must be less than 100 characters" };
  }
  
  if (!validateString(input.occasion, 50)) {
    return { valid: false, error: "Occasion is required" };
  }
  
  if (!validateString(input.genre, 50)) {
    return { valid: false, error: "Genre is required" };
  }
  
  if (!validateString(input.singerPreference, 50)) {
    return { valid: false, error: "Singer preference is required" };
  }
  
  if (!validateString(input.relationship, 200)) {
    return { valid: false, error: "Relationship description is required" };
  }
  
  if (!validateString(input.specialQualities, 2000)) {
    return { valid: false, error: "Special qualities is required and must be less than 2000 characters" };
  }
  
  if (!validateString(input.favoriteMemory, 2000)) {
    return { valid: false, error: "Favorite memory is required and must be less than 2000 characters" };
  }
  
  if (!validateOptionalString(input.specialMessage, 2000)) {
    return { valid: false, error: "Special message must be less than 2000 characters" };
  }
  
  if (!["standard", "priority"].includes(input.pricingTier)) {
    return { valid: false, error: "Invalid pricing tier" };
  }
  
  return { valid: true };
}

function calculateExpectedDelivery(tier: "standard" | "priority"): string {
  const now = new Date();
  if (tier === "priority") {
    // 3 hours from now
    return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
  }
  // 24 hours from now for standard
  return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
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

    const input: OrderInput = await req.json();
    
    // Validate input
    const validation = validateOrderInput(input);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role for secure insert
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const price = input.pricingTier === "priority" ? 79 : 49;
    const expectedDelivery = calculateExpectedDelivery(input.pricingTier);

    // Insert order using service role (bypasses RLS)
    const { data, error } = await supabase
      .from("orders")
      .insert({
        pricing_tier: input.pricingTier,
        price,
        expected_delivery: expectedDelivery,
        customer_name: input.customerName.trim(),
        customer_email: input.customerEmail.trim().toLowerCase(),
        customer_phone: input.customerPhone?.trim() || null,
        recipient_type: input.recipientType,
        recipient_name: input.recipientName.trim(),
        occasion: input.occasion,
        genre: input.genre,
        singer_preference: input.singerPreference,
        relationship: input.relationship.trim(),
        special_qualities: input.specialQualities.trim(),
        favorite_memory: input.favoriteMemory.trim(),
        special_message: input.specialMessage?.trim() || null,
        device_type: input.deviceType || null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Database error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to create order" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        orderId: data.id, 
        expectedDelivery 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
