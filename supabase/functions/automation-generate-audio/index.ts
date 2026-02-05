import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper to normalize entity data from leads or orders
interface EntityData {
  id: string;
  recipient_name: string;
  genre: string;
  singer_preference: string;
  automation_manual_override_at?: string | null;
  automation_lyrics?: string | null;
  automation_retry_count?: number | null;
  song_title?: string | null;
}

function normalizeEntityData(entity: Record<string, unknown>): EntityData {
  return {
    id: entity.id as string,
    recipient_name: entity.recipient_name as string,
    genre: entity.genre as string,
    singer_preference: entity.singer_preference as string,
    automation_manual_override_at: entity.automation_manual_override_at as string | null,
    automation_lyrics: entity.automation_lyrics as string | null,
    automation_retry_count: entity.automation_retry_count as number | null,
    song_title: entity.song_title as string | null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      console.error("[AUDIO] KIE_API_KEY not configured");
      throw new Error("KIE_API_KEY not configured");
    }

    const { leadId, orderId } = await req.json();
    
    // Determine entity type
    const entityType = orderId ? "order" : "lead";
    const entityId = orderId || leadId;
    const tableName = entityType === "order" ? "orders" : "leads";
    
    console.log(`[AUDIO] Starting audio generation for ${entityType} ${entityId}`);
    
    if (!entityId) {
      console.error("[AUDIO] Missing entityId in request");
      return new Response(
        JSON.stringify({ error: "leadId or orderId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch entity with lyrics
    const { data: rawEntity, error: fetchError } = await supabase
      .from(tableName)
      .select("*, song_styles!automation_style_id(*)")
      .eq("id", entityId)
      .single();

    if (fetchError || !rawEntity) {
      console.error(`[AUDIO] ${entityType} not found: ${entityId}`, fetchError);
      return new Response(
        JSON.stringify({ error: `${entityType} not found` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const entity = normalizeEntityData(rawEntity);
    console.log(`[AUDIO] Found ${entityType}: ${entity.recipient_name}, genre: ${entity.genre}, singer: ${entity.singer_preference}`);

    // Check if manual override is set
    if (entity.automation_manual_override_at) {
      console.log(`[AUDIO] Manual override active for ${entityType} ${entity.id}, skipping`);
      return new Response(
        JSON.stringify({ error: "Manual override active, skipping automation" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure we have lyrics
    if (!entity.automation_lyrics) {
      console.error(`[AUDIO] No lyrics available for ${entityType} ${entityId}`);
      return new Response(
        JSON.stringify({ error: `No lyrics available for this ${entityType}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[AUDIO] Lyrics available, length: ${entity.automation_lyrics.length} chars`);

    // Match style based on genre and singer preference
    const genreMap: Record<string, string> = {
       // Database slug format (primary)
       "pop": "pop",
       "country": "country",
       "rock": "rock",
       "rnb": "r&b",
       "jazz": "jazz",
       "acoustic": "acoustic",
       "rap-hip-hop": "hip-hop",
       "indie": "indie-folk",
       "latin": "latin-pop",
       "kpop": "k-pop",
       "edm-dance": "edm",
       // Display label format (backward compatibility)
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

     const normalizedGenre = genreMap[entity.genre];
     if (!normalizedGenre) {
       console.warn(`[AUDIO] Unknown genre "${entity.genre}", falling back to pop`);
     }
     const finalGenre = normalizedGenre || "pop";
    const vocalGender = entity.singer_preference?.toLowerCase() === "female" ? "female" : "male";

     console.log(`[AUDIO] Looking for style: genre=${finalGenre}, vocal=${vocalGender}`);

    // Fetch matching style
    const { data: style, error: styleError } = await supabase
      .from("song_styles")
      .select("*")
       .eq("genre_match", finalGenre)
      .eq("vocal_gender", vocalGender)
      .eq("is_active", true)
      .limit(1)
      .single();

    let selectedStyle = style;

    if (styleError || !style) {
       console.log(`[AUDIO] No exact style match for ${finalGenre}/${vocalGender}, trying fallback`);
      
      // Fallback to any active style with matching genre
      const { data: fallbackStyle } = await supabase
        .from("song_styles")
        .select("*")
         .eq("genre_match", finalGenre)
        .eq("is_active", true)
        .limit(1)
        .single();
      
      if (fallbackStyle) {
        selectedStyle = fallbackStyle;
        console.log(`[AUDIO] Using fallback style: ${fallbackStyle.label}`);
      } else {
        // Ultimate fallback - just use pop
        const { data: popStyle } = await supabase
          .from("song_styles")
          .select("*")
          .eq("genre_match", "pop")
          .eq("is_active", true)
          .limit(1)
          .single();
        
        if (popStyle) {
          selectedStyle = popStyle;
          console.log(`[AUDIO] Using pop fallback style: ${popStyle.label}`);
        } else {
          console.log(`[AUDIO] No styles in database, using default prompt`);
          selectedStyle = { 
            id: null, 
            suno_prompt: "modern pop love song, warm romantic vibe, heartfelt vocal",
            label: "Default Pop"
          };
        }
      }
    } else {
      console.log(`[AUDIO] Found exact style match: ${style.label}`);
    }

    // Update entity with style selection and reset timer for accurate STUCK detection
    await supabase
      .from(tableName)
      .update({ 
        automation_status: "audio_generating",
        automation_style_id: selectedStyle.id,
        automation_started_at: new Date().toISOString(), // Reset timer for audio phase
      })
      .eq("id", entityId);

    // Increment style usage count
    if (selectedStyle.id) {
      await supabase
        .from("song_styles")
        .update({ usage_count: (selectedStyle.usage_count || 0) + 1 })
        .eq("id", selectedStyle.id);
    }

    // Build callback URL with entity type info encoded in taskId prefix
    const callbackUrl = `${supabaseUrl}/functions/v1/automation-suno-callback`;
    console.log(`[AUDIO] Callback URL: ${callbackUrl}`);

    // Use customMode for better quality: separate style, title, and lyrics
    const songTitle = entity.song_title || `Song for ${entity.recipient_name}`;

    console.log(`[AUDIO] Calling Suno API via Kie.ai`);
    console.log(`[AUDIO] Style: ${selectedStyle.suno_prompt?.substring(0, 80)}...`);
    console.log(`[AUDIO] Title: ${songTitle}`);
    console.log(`[AUDIO] Model: V4_5, customMode: true`);

    // Call Suno via Kie.ai with customMode=true and V4_5 model
    const sunoResponse = await fetch("https://api.kie.ai/api/v1/generate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${KIE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: entity.automation_lyrics,           // Lyrics only in prompt
        style: selectedStyle.suno_prompt,           // Style prompt separately
        title: songTitle,                           // Title separately
        customMode: true,                           // Enable custom mode for better control
        instrumental: false,
        model: "V4_5",                              // Upgraded from V3_5 for smarter prompts
        callBackUrl: callbackUrl,
      }),
    });

    console.log(`[AUDIO] Suno API response status: ${sunoResponse.status}`);

    if (!sunoResponse.ok) {
      const errorText = await sunoResponse.text();
      console.error(`[AUDIO] Suno API error: ${sunoResponse.status}`, errorText);
      
      await supabase
        .from(tableName)
        .update({
          automation_status: "failed",
          automation_last_error: `[AUDIO] Suno API error: ${sunoResponse.status} - ${errorText.substring(0, 200)}`,
          automation_retry_count: (entity.automation_retry_count || 0) + 1,
        })
        .eq("id", entityId);

      return new Response(
        JSON.stringify({ error: "Audio generation failed", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sunoData = await sunoResponse.json();
    console.log(`[AUDIO] Suno response:`, JSON.stringify(sunoData).substring(0, 500));
    
    if (sunoData?.code !== 200 || !sunoData?.data?.taskId) {
      console.error("[AUDIO] Invalid Suno response:", sunoData);
      
      await supabase
        .from(tableName)
        .update({
          automation_status: "failed",
          automation_last_error: `[AUDIO] Invalid Suno response: ${sunoData?.msg || "No taskId returned"}`,
          automation_retry_count: (entity.automation_retry_count || 0) + 1,
        })
        .eq("id", entityId);

      return new Response(
        JSON.stringify({ error: "Invalid Suno response", details: sunoData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const taskId = sunoData.data.taskId;
    console.log(`[AUDIO] ✅ Suno task created: ${taskId}`);

    // Store task ID for callback matching
    await supabase
      .from(tableName)
      .update({ automation_task_id: taskId })
      .eq("id", entityId);

    console.log(`[AUDIO] TaskId saved to ${entityType} ${entityId}`);
    console.log(`[AUDIO] Waiting for callback from Suno (1-3 minutes)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        entityType,
        entityId,
        taskId,
        styleUsed: selectedStyle.label || selectedStyle.suno_prompt?.substring(0, 50),
        callbackUrl,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[AUDIO] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
