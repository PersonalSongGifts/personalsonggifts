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
    const { leadId, orderId, forceRun = false } = await req.json();
    
    // Determine entity type and ID
    const entityType = orderId ? "order" : "lead";
    const entityId = orderId || leadId;
    const tableName = entityType === "order" ? "orders" : "leads";
    
    console.log(`[TRIGGER] Starting automation for ${entityType} ${entityId}, forceRun: ${forceRun}`);
    
    if (!entityId) {
      console.error("[TRIGGER] Missing entityId in request");
      return new Response(
        JSON.stringify({ error: "leadId or orderId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch entity
    const { data: entity, error: fetchError } = await supabase
      .from(tableName)
      .select("*")
      .eq("id", entityId)
      .single();

    if (fetchError || !entity) {
      console.error(`[TRIGGER] ${entityType} not found: ${entityId}`, fetchError);
      return new Response(
        JSON.stringify({ error: `${entityType} not found` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Block automation for cancelled/dismissed orders
    if (entityType === "order") {
      if (entity.status === "cancelled" || entity.dismissed_at) {
        console.log(`[TRIGGER] Order ${entityId} is cancelled/dismissed, skipping automation`);
        return new Response(
          JSON.stringify({ error: "Order is cancelled", dismissed: true }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Block automation for dismissed leads
    if (entityType === "lead" && entity.dismissed_at) {
      console.log(`[TRIGGER] Lead ${entityId} is dismissed, skipping automation`);
      return new Response(
        JSON.stringify({ error: "Lead is dismissed", dismissed: true }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize field access (leads use email, orders use customer_email)
    const recipientName = entity.recipient_name;
    const email = entityType === "order" ? entity.customer_email : entity.email;
    const existingSongUrl = entityType === "order" ? entity.song_url : entity.preview_song_url;
    
    console.log(`[TRIGGER] Found ${entityType}: ${recipientName} (${email})`);

    // Check if already has a song (skip unless forcing)
    if (existingSongUrl && !forceRun) {
      console.log(`[TRIGGER] ${entityType} ${entityId} already has a song, skipping`);
      return new Response(
        JSON.stringify({ error: `${entityType} already has a song`, hasExisting: true }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if automation is already running
    if (["pending", "lyrics_generating", "audio_generating"].includes(entity.automation_status) && !forceRun) {
      console.log(`[TRIGGER] Automation already in progress for ${entityType} ${entityId}, status: ${entity.automation_status}`);
      return new Response(
        JSON.stringify({ error: "Automation already in progress", status: entity.automation_status }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For leads only: check quality threshold (orders are paid, so always process)
    if (entityType === "lead") {
      const { data: thresholdSetting } = await supabase
        .from("admin_settings")
        .select("value")
        .eq("key", "automation_quality_threshold")
        .single();

      const qualityThreshold = parseInt(thresholdSetting?.value || "65", 10);
      console.log(`[TRIGGER] Quality threshold: ${qualityThreshold}, lead score: ${entity.quality_score}`);

      // Check quality score (skip if below threshold, unless forcing)
      if (!forceRun && (entity.quality_score || 0) < qualityThreshold) {
        console.log(`[TRIGGER] Quality score ${entity.quality_score} below threshold ${qualityThreshold}`);
        return new Response(
          JSON.stringify({ 
            error: "Quality score below threshold", 
            score: entity.quality_score,
            threshold: qualityThreshold,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Mark as pending
    console.log(`[TRIGGER] Marking ${entityType} ${entityId} as pending`);
    await supabase
      .from(tableName)
      .update({
        automation_status: "pending",
        automation_retry_count: 0,
        automation_last_error: null,
        automation_started_at: new Date().toISOString(),
      })
      .eq("id", entityId);

    // Step 1: Generate lyrics
    console.log(`[TRIGGER] Step 1: Calling lyrics generation for ${entityType} ${entityId}`);
    
    const lyricsBody = entityType === "order" 
      ? { orderId: entityId }
      : { leadId: entityId };
    
    const lyricsResponse = await fetch(`${supabaseUrl}/functions/v1/automation-generate-lyrics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify(lyricsBody),
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
    console.log(`[TRIGGER] Step 2: Calling audio generation for ${entityType} ${entityId}`);
    
    const audioBody = entityType === "order" 
      ? { orderId: entityId }
      : { leadId: entityId };
    
    const audioResponse = await fetch(`${supabaseUrl}/functions/v1/automation-generate-audio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify(audioBody),
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

    console.log(`[TRIGGER] ✅ Pipeline started successfully for ${entityType} ${entityId}`);
    console.log(`[TRIGGER] Lyrics: done, Audio: generating (callback will complete)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        entityType,
        entityId,
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
