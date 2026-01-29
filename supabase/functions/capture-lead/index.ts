import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LeadInput {
  email: string;
  phone?: string;
  customerName: string;
  recipientName: string;
  recipientType: string;
  occasion: string;
  genre: string;
  singerPreference: string;
  specialQualities: string;
  favoriteMemory: string;
  specialMessage?: string;
}

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

function validateString(value: string, maxLength: number): boolean {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function validateLeadInput(input: LeadInput): { valid: boolean; error?: string } {
  if (!validateEmail(input.email)) {
    return { valid: false, error: "Valid email address is required" };
  }
  
  if (!validateString(input.customerName, 100)) {
    return { valid: false, error: "Customer name is required" };
  }
  
  if (!validateString(input.recipientName, 100)) {
    return { valid: false, error: "Recipient name is required" };
  }
  
  if (!validateString(input.recipientType, 50)) {
    return { valid: false, error: "Recipient type is required" };
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
  
  if (!validateString(input.specialQualities, 250)) {
    return { valid: false, error: "Special qualities is required" };
  }
  
  if (!validateString(input.favoriteMemory, 250)) {
    return { valid: false, error: "Favorite memory is required" };
  }
  
  return { valid: true };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
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

    const input: LeadInput = await req.json();
    
    // Validate input
    const validation = validateLeadInput(input);
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

    const normalizedEmail = input.email.trim().toLowerCase();

    // Check if lead already exists with this email
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id, status")
      .eq("email", normalizedEmail)
      .single();

    if (existingLead) {
      // Lead already exists - update it with latest info (unless already converted)
      if (existingLead.status === "converted") {
        console.log("Lead already converted, skipping update:", normalizedEmail);
        return new Response(
          JSON.stringify({ success: true, message: "Lead already converted" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await supabase
        .from("leads")
        .update({
          phone: input.phone?.trim() || null,
          customer_name: input.customerName.trim(),
          recipient_name: input.recipientName.trim(),
          recipient_type: input.recipientType,
          occasion: input.occasion,
          genre: input.genre,
          singer_preference: input.singerPreference,
          special_qualities: input.specialQualities.trim(),
          favorite_memory: input.favoriteMemory.trim(),
          special_message: input.specialMessage?.trim() || null,
          captured_at: new Date().toISOString(), // Update capture time
        })
        .eq("id", existingLead.id);

      if (updateError) {
        console.error("Database update error:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update lead" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Lead updated:", normalizedEmail);
      return new Response(
        JSON.stringify({ success: true, leadId: existingLead.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert new lead
    const { data, error } = await supabase
      .from("leads")
      .insert({
        email: normalizedEmail,
        phone: input.phone?.trim() || null,
        customer_name: input.customerName.trim(),
        recipient_name: input.recipientName.trim(),
        recipient_type: input.recipientType,
        occasion: input.occasion,
        genre: input.genre,
        singer_preference: input.singerPreference,
        special_qualities: input.specialQualities.trim(),
        favorite_memory: input.favoriteMemory.trim(),
        special_message: input.specialMessage?.trim() || null,
        status: "lead",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Database insert error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to capture lead" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Lead captured:", normalizedEmail);
    return new Response(
      JSON.stringify({ success: true, leadId: data.id }),
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
