import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      .select("id, recipient_name, recipient_type, occasion, genre, preview_song_url, cover_image_url, song_title, status, preview_opened_at")
      .eq("preview_token", previewToken)
      .single();

    if (error || !lead) {
      console.error("Lead not found:", error);
      return new Response(
        JSON.stringify({ error: "Preview not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if lead has been converted - if so, don't show preview page
    if (lead.status === "converted") {
      return new Response(
        JSON.stringify({ error: "This song has already been purchased", converted: true }),
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

    return new Response(
      JSON.stringify({
        recipientName: lead.recipient_name,
        recipientType: lead.recipient_type,
        occasion: lead.occasion,
        genre: lead.genre,
        previewUrl: lead.preview_song_url,
        coverImageUrl: lead.cover_image_url,
        songTitle: lead.song_title,
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
