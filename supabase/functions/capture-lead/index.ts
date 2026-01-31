import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LEAD_ZAPIER_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/25040439/ult7k26/";

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
  deviceType?: string;
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

/**
 * Calculate lead quality score (0-100)
 * Higher scores = more likely to be a genuine lead worth pursuing
 */
function calculateLeadQuality(input: LeadInput): number {
  let score = 0;
  
  const sq = input.specialQualities.trim();
  const fm = input.favoriteMemory.trim();
  
  // Length scoring for special_qualities (0-25)
  score += sq.length >= 100 ? 25 : sq.length >= 30 ? 20 : sq.length >= 10 ? 10 : 0;
  
  // Length scoring for favorite_memory (0-25)
  score += fm.length >= 100 ? 25 : fm.length >= 30 ? 20 : fm.length >= 10 ? 10 : 0;
  
  // Gibberish detection
  const combined = (sq + " " + fm).toLowerCase();
  const junkPatterns = /^(test|asdf|qwer|1234|xxx|aaa|zzz|abc|hjk|jkl|fgh|testing)/i;
  const isAllSameChar = /^(.)\1+$/.test(sq) || /^(.)\1+$/.test(fm);
  
  // Apply junk penalty only for short inputs
  if ((junkPatterns.test(sq) || junkPatterns.test(fm) || isAllSameChar) && combined.length < 30) {
    score = Math.max(0, score - 30);
  }
  
  // Meaningful words bonus (up to 15 points)
  const meaningfulWords = [
    'love', 'heart', 'memory', 'always', 'together', 
    'beautiful', 'special', 'amazing', 'best', 'happy', 
    'wonderful', 'caring', 'family', 'friend', 'forever', 
    'remember', 'moment', 'laugh', 'smile', 'thank',
    'years', 'life', 'time', 'first', 'day', 'night', 'morning',
    'birthday', 'anniversary', 'wedding', 'valentine', 'mother', 'father',
    'wife', 'husband', 'daughter', 'son', 'grandma', 'grandpa', 'baby'
  ];
  const wordMatches = meaningfulWords.filter(w => combined.includes(w)).length;
  score += Math.min(wordMatches * 5, 15);
  
  // Email quality (not disposable) (+10)
  const disposableDomains = ['tempmail', 'guerrilla', '10minute', 'throwaway', 'mailinator', 'yopmail', 'fakeinbox'];
  const emailDomain = input.email.split('@')[1]?.toLowerCase() || '';
  if (!disposableDomains.some(d => emailDomain.includes(d))) {
    score += 10;
  }
  
  // Phone bonus (+5)
  if (input.phone && input.phone.trim().length >= 10) {
    score += 5;
  }
  
  return Math.max(0, Math.min(100, score));
}

async function triggerLeadZapierWebhook(input: LeadInput, qualityScore: number): Promise<void> {
  try {
    const payload = {
      lead_name: input.customerName.trim(),
      lead_email: input.email.trim().toLowerCase(),
      lead_phone: input.phone?.trim() || "",
      recipient_type: input.recipientType,
      recipient_name: input.recipientName.trim(),
      occasion: input.occasion,
      genre: input.genre,
      singer_preference: input.singerPreference,
      relationship: input.recipientType,
      special_qualities: input.specialQualities.trim(),
      favorite_memory: input.favoriteMemory.trim(),
      special_message: input.specialMessage?.trim() || "",
      device_type: input.deviceType || "unknown",
      quality_score: qualityScore,
      captured_at: new Date().toISOString(),
    };

    const response = await fetch(LEAD_ZAPIER_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error("Zapier webhook failed:", response.status, await response.text());
    } else {
      console.log("Zapier lead webhook triggered successfully");
    }
  } catch (error) {
    // Fire-and-forget - don't fail lead capture if webhook fails
    console.error("Zapier webhook error:", error);
  }
}

async function syncLeadToGoogleSheet(leadId: string, input: LeadInput, qualityScore: number): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/append-to-sheet`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        leadId: leadId,
        capturedAt: new Date().toISOString(),
        status: "lead",
        customerName: input.customerName.trim(),
        customerEmail: input.email.trim().toLowerCase(),
        customerPhone: input.phone?.trim() || "",
        recipientName: input.recipientName.trim(),
        occasion: input.occasion,
        genre: input.genre,
        singerPreference: input.singerPreference,
        specialQualities: input.specialQualities.trim(),
        favoriteMemory: input.favoriteMemory.trim(),
        specialMessage: input.specialMessage?.trim() || "",
        deviceType: input.deviceType || "unknown",
        qualityScore: qualityScore,
      }),
    });

    if (!response.ok) {
      console.error("Google Sheets sync failed:", response.status, await response.text());
    } else {
      console.log("Lead synced to Google Sheets");
    }
  } catch (error) {
    // Fire-and-forget - don't fail lead capture if sheet sync fails
    console.error("Google Sheets sync error:", error);
  }
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

    // Calculate quality score
    const qualityScore = calculateLeadQuality(input);
    console.log(`Lead quality score: ${qualityScore} for ${input.email}`);

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
          captured_at: new Date().toISOString(),
          quality_score: qualityScore,
        })
        .eq("id", existingLead.id);

      if (updateError) {
        console.error("Database update error:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update lead" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Trigger Zapier webhook for updated lead
      triggerLeadZapierWebhook(input, qualityScore);
      
      // Sync to Google Sheets (unified with orders)
      syncLeadToGoogleSheet(existingLead.id, input, qualityScore);

      console.log("Lead updated:", normalizedEmail);
      return new Response(
        JSON.stringify({ success: true, leadId: existingLead.id, qualityScore }),
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
        quality_score: qualityScore,
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

    // Trigger Zapier webhook for new lead
    triggerLeadZapierWebhook(input, qualityScore);
    
    // Sync to Google Sheets (unified with orders)
    syncLeadToGoogleSheet(data.id, input, qualityScore);

    console.log("Lead captured:", normalizedEmail, "Quality:", qualityScore);
    return new Response(
      JSON.stringify({ success: true, leadId: data.id, qualityScore }),
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
