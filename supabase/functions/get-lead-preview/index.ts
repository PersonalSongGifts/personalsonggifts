import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const previewToken = url.searchParams.get("token");

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
    const { data: lead, error } = await supabase
      .from("leads")
      .select("id, recipient_name, recipient_type, occasion, genre, preview_song_url, cover_image_url, song_title, status, preview_opened_at, order_id")
      .eq("preview_token", previewToken)
      .single();

    if (error || !lead) {
      console.error("Lead not found:", error);
      return new Response(
        JSON.stringify({ error: "Preview not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if lead has been converted - redirect to full song page
    if (lead.status === "converted") {
      return new Response(
        JSON.stringify({ 
          error: "This song has already been purchased", 
          converted: true,
          orderId: lead.order_id 
        }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if preview song exists
    if (!lead.preview_song_url) {
      return new Response(
        JSON.stringify({ error: "Preview not ready yet" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update preview_opened_at if this is the first visit
    if (!lead.preview_opened_at) {
      await supabase
        .from("leads")
        .update({ preview_opened_at: new Date().toISOString() })
        .eq("id", lead.id);
      console.log(`Lead ${lead.id} preview opened for first time`);
    }

    // Check FLASH20 eligibility: targeted promo + active + unexpired + lead received the email
    let flash20Eligible = false;
    let flash20Expired = false;
    let flash20PriceCents: number | null = null;
    let flash20EndsAt: string | null = null;
    {
      const { data: promo } = await supabase
        .from("promotions")
        .select("is_active, targeted, starts_at, ends_at, lead_price_cents")
        .eq("slug", "flash20")
        .maybeSingle();

      if (promo && promo.targeted === true) {
        const { data: logEntry } = await supabase
          .from("order_activity_log")
          .select("id")
          .eq("entity_type", "lead")
          .eq("entity_id", lead.id)
          .eq("event_type", "flash20_sent")
          .limit(1)
          .maybeSingle();

        if (logEntry) {
          const now = new Date();
          const starts = new Date(promo.starts_at);
          const ends = new Date(promo.ends_at);
          if (promo.is_active && now >= starts && now <= ends) {
            flash20Eligible = true;
            flash20PriceCents = promo.lead_price_cents;
            flash20EndsAt = promo.ends_at;
          } else if (now > ends) {
            flash20Expired = true;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        recipientName: lead.recipient_name,
        recipientType: lead.recipient_type,
        occasion: lead.occasion,
        genre: lead.genre,
        previewUrl: lead.preview_song_url,
        coverImageUrl: lead.cover_image_url,
        songTitle: lead.song_title,
        flash20Eligible,
        flash20Expired,
        flash20PriceCents,
        flash20EndsAt,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Get lead preview error:", error);
    return new Response(
      JSON.stringify({ error: "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
