import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { leadId, forceRun = false } = await req.json();
    
    console.log(`[TRIGGER] Starting automation for lead ${leadId}, forceRun: ${forceRun}`);
    
    if (!leadId) {
      console.error("[TRIGGER] Missing leadId in request");
      return new Response(
        JSON.stringify({ error: "leadId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch lead
    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (fetchError || !lead) {
      console.error(`[TRIGGER] Lead not found: ${leadId}`, fetchError);
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[TRIGGER] Found lead: ${lead.recipient_name} (${lead.email})`);

    // Check if already has a song (skip unless forcing)
    if (lead.preview_song_url && !forceRun) {
      console.log(`[TRIGGER] Lead ${leadId} already has a song, skipping`);
      return new Response(
        JSON.stringify({ error: "Lead already has a song", hasExisting: true }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if automation is already running
    if (["pending", "lyrics_generating", "audio_generating"].includes(lead.automation_status) && !forceRun) {
      console.log(`[TRIGGER] Automation already in progress for lead ${leadId}, status: ${lead.automation_status}`);
      return new Response(
        JSON.stringify({ error: "Automation already in progress", status: lead.automation_status }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get quality threshold from admin settings
    const { data: thresholdSetting } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "automation_quality_threshold")
      .single();

    const qualityThreshold = parseInt(thresholdSetting?.value || "65", 10);
    console.log(`[TRIGGER] Quality threshold: ${qualityThreshold}, lead score: ${lead.quality_score}`);

    // Check quality score (skip if below threshold, unless forcing)
    if (!forceRun && (lead.quality_score || 0) < qualityThreshold) {
      console.log(`[TRIGGER] Quality score ${lead.quality_score} below threshold ${qualityThreshold}`);
      return new Response(
        JSON.stringify({ 
          error: "Quality score below threshold", 
          score: lead.quality_score,
          threshold: qualityThreshold,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark as pending
    console.log(`[TRIGGER] Marking lead ${leadId} as pending`);
    await supabase
      .from("leads")
      .update({
        automation_status: "pending",
        automation_retry_count: 0,
        automation_last_error: null,
        automation_started_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    // Step 1: Generate lyrics
    console.log(`[TRIGGER] Step 1: Calling lyrics generation for lead ${leadId}`);
    
    const lyricsResponse = await fetch(`${supabaseUrl}/functions/v1/automation-generate-lyrics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ leadId }),
    });

    if (!lyricsResponse.ok) {
      const error = await lyricsResponse.text();
      console.error(`[TRIGGER] Lyrics generation failed: ${lyricsResponse.status}`, error);
      return new Response(
        JSON.stringify({ error: "Lyrics generation failed", details: error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lyricsResult = await lyricsResponse.json();
    console.log(`[TRIGGER] Step 1 complete - Lyrics generated: "${lyricsResult.title}"`);

    // Step 2: Generate audio (will trigger callback when done)
    console.log(`[TRIGGER] Step 2: Calling audio generation for lead ${leadId}`);
    
    const audioResponse = await fetch(`${supabaseUrl}/functions/v1/automation-generate-audio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ leadId }),
    });

    if (!audioResponse.ok) {
      const error = await audioResponse.text();
      console.error(`[TRIGGER] Audio generation failed: ${audioResponse.status}`, error);
      return new Response(
        JSON.stringify({ error: "Audio generation failed", details: error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const audioResult = await audioResponse.json();
    console.log(`[TRIGGER] Step 2 complete - Audio generation started, taskId: ${audioResult.taskId}`);

    console.log(`[TRIGGER] ✅ Pipeline started successfully for lead ${leadId}`);
    console.log(`[TRIGGER] Lyrics: done, Audio: generating (callback will complete)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        leadId,
        status: "audio_generating",
        taskId: audioResult.taskId,
        lyricsTitle: lyricsResult.title,
        message: "Song generation started. Audio will be ready in 1-3 minutes.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[TRIGGER] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
