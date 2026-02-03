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
    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      throw new Error("KIE_API_KEY not configured");
    }

    const { leadId } = await req.json();
    if (!leadId) {
      return new Response(
        JSON.stringify({ error: "leadId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch lead with lyrics
    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("*, song_styles!automation_style_id(*)")
      .eq("id", leadId)
      .single();

    if (fetchError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if manual override is set
    if (lead.automation_manual_override_at) {
      return new Response(
        JSON.stringify({ error: "Manual override active, skipping automation" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure we have lyrics
    if (!lead.automation_lyrics) {
      return new Response(
        JSON.stringify({ error: "No lyrics available for this lead" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Match style based on genre and singer preference
    const genreMap: Record<string, string> = {
      "Pop": "pop",
      "Country": "country",
      "Rock": "rock",
      "R&B": "r&b",
      "Jazz": "jazz",
      "Acoustic": "acoustic",
      "Rap / Hip-Hop": "hip-hop",
      "Hip-Hop": "hip-hop",
      "Indie": "indie-folk",
      "Indie Folk": "indie-folk",
      "Latin": "latin-pop",
      "Latin Pop": "latin-pop",
      "K-Pop": "k-pop",
      "EDM / Dance": "edm",
      "EDM": "edm",
    };

    const normalizedGenre = genreMap[lead.genre] || "pop";
    const vocalGender = lead.singer_preference?.toLowerCase() === "female" ? "female" : "male";

    // Fetch matching style
    const { data: style, error: styleError } = await supabase
      .from("song_styles")
      .select("*")
      .eq("genre_match", normalizedGenre)
      .eq("vocal_gender", vocalGender)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (styleError || !style) {
      console.log(`No style found for ${normalizedGenre}/${vocalGender}, using fallback`);
      // Fallback to any active style with matching genre
      const { data: fallbackStyle } = await supabase
        .from("song_styles")
        .select("*")
        .eq("genre_match", normalizedGenre)
        .eq("is_active", true)
        .limit(1)
        .single();
      
      if (!fallbackStyle) {
        // Ultimate fallback - just use pop
        const { data: popStyle } = await supabase
          .from("song_styles")
          .select("*")
          .eq("genre_match", "pop")
          .eq("is_active", true)
          .limit(1)
          .single();
        
        if (!popStyle) {
          return new Response(
            JSON.stringify({ error: "No styles available in database" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    const selectedStyle = style || { id: null, suno_prompt: "modern pop love song, warm romantic vibe, heartfelt vocal" };

    // Update lead with style selection
    await supabase
      .from("leads")
      .update({ 
        automation_status: "audio_generating",
        automation_style_id: selectedStyle.id,
      })
      .eq("id", leadId);

    // Increment style usage count
    if (selectedStyle.id) {
      await supabase
        .from("song_styles")
        .update({ usage_count: (style?.usage_count || 0) + 1 })
        .eq("id", selectedStyle.id);
    }

    // Build callback URL
    const callbackUrl = `${supabaseUrl}/functions/v1/automation-suno-callback`;

    // Use customMode for better quality: separate style, title, and lyrics
    const songTitle = lead.song_title || `Song for ${lead.recipient_name}`;

    // Call Suno via Kie.ai with customMode=true and V4_5 model
    console.log(`Calling Suno for lead ${leadId} with style: ${selectedStyle.suno_prompt?.substring(0, 50)}...`);
    
    const sunoResponse = await fetch("https://api.kie.ai/api/v1/generate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${KIE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: lead.automation_lyrics,           // Lyrics only in prompt
        style: selectedStyle.suno_prompt,         // Style prompt separately
        title: songTitle,                         // Title separately
        customMode: true,                         // Enable custom mode for better control
        instrumental: false,
        model: "V4_5",                            // Upgraded from V3_5 for smarter prompts
        callBackUrl: callbackUrl,
      }),
    });

    if (!sunoResponse.ok) {
      const errorText = await sunoResponse.text();
      console.error("Suno API error:", sunoResponse.status, errorText);
      
      await supabase
        .from("leads")
        .update({
          automation_status: "failed",
          automation_last_error: `Suno API error: ${sunoResponse.status}`,
          automation_retry_count: (lead.automation_retry_count || 0) + 1,
        })
        .eq("id", leadId);

      return new Response(
        JSON.stringify({ error: "Audio generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sunoData = await sunoResponse.json();
    
    if (sunoData?.code !== 200 || !sunoData?.data?.taskId) {
      console.error("Suno response invalid:", sunoData);
      
      await supabase
        .from("leads")
        .update({
          automation_status: "failed",
          automation_last_error: `Invalid Suno response: ${sunoData?.msg || "Unknown error"}`,
          automation_retry_count: (lead.automation_retry_count || 0) + 1,
        })
        .eq("id", leadId);

      return new Response(
        JSON.stringify({ error: "Invalid Suno response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const taskId = sunoData.data.taskId;

    // Store task ID for callback matching
    await supabase
      .from("leads")
      .update({ automation_task_id: taskId })
      .eq("id", leadId);

    console.log(`Suno task started for lead ${leadId}: ${taskId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        leadId,
        taskId,
        styleUsed: selectedStyle.suno_prompt?.substring(0, 50),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Audio generation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
