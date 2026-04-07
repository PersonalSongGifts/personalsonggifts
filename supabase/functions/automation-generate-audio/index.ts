import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { getLanguageLabel } from "../_shared/language-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Strip Suno section/instrument tags (e.g. [Verse], [Soft melodic acoustic guitar picking])
// from lyrics so they don't override the bonus style prompt.
// Preserves actual lyric lines — only removes lines that are purely bracket tags.
function stripSunoTags(lyrics: string): string {
  return lyrics
    .split("\n")
    .filter(line => !/^\s*\[.*\]\s*$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n"); // collapse excessive blank lines
}

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
  lyrics_language_code: string;
  pricing_tier?: string | null;
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
    lyrics_language_code: (entity.lyrics_language_code as string) || "en",
    pricing_tier: entity.pricing_tier as string | null,
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
    const languageCode = entity.lyrics_language_code;
    const languageLabel = getLanguageLabel(languageCode);
    
    console.log(`[AUDIO] Found ${entityType}: ${entity.recipient_name}, genre: ${entity.genre}, singer: ${entity.singer_preference}, language: ${languageLabel}`);

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

    // ========== FETCH SUNO MODEL SETTINGS ==========
    const { data: modelSetting } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "suno_model")
      .maybeSingle();

    const { data: v5EnabledSetting } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "suno_model_v5_enabled")
      .maybeSingle();

    const { data: v5PriorityOnlySetting } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "suno_model_v5_priority_only")
      .maybeSingle();

    // Determine which model to use
    const defaultModel = (modelSetting as { value: string } | null)?.value || "V4_5";
    const v5Enabled = (v5EnabledSetting as { value: string } | null)?.value === "true";
    const v5PriorityOnly = (v5PriorityOnlySetting as { value: string } | null)?.value !== "false"; // Default true
    const isPriority = entityType === "order" && entity.pricing_tier === "priority";

    let model = defaultModel;
    if (v5Enabled && (!v5PriorityOnly || isPriority)) {
      model = "V4_5PLUS"; // V5 identifier
    }

    console.log(`[AUDIO] Model used: ${model} (v5_enabled=${v5Enabled}, v5_priority_only=${v5PriorityOnly}, is_priority=${isPriority})`);

    // Match style based on genre and singer preference
    const genreMap: Record<string, string> = {
       // Database slug format (primary)
       "pop": "pop",
       "country": "country",
       "prayer": "worship",
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
       "Prayer": "worship",
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
        "bollywood": "bollywood",
        "Bollywood / Hindi": "bollywood",
        "Bollywood": "bollywood",
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

    // Build style string with language diction note
    let styleString = selectedStyle.suno_prompt;
    if (languageCode !== "en") {
      styleString += `. Vocals in ${languageLabel}. Clear diction.`;
      console.log(`[AUDIO] Added language diction note for ${languageLabel}`);
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
    console.log(`[AUDIO] Style: ${styleString.substring(0, 80)}...`);
    console.log(`[AUDIO] Title: ${songTitle}`);
    console.log(`[AUDIO] Model: ${model}, customMode: true, language: ${languageCode}`);

    // Call Suno via Kie.ai with customMode=true
    const sunoResponse = await fetch("https://api.kie.ai/api/v1/generate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${KIE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: entity.automation_lyrics,           // Lyrics only in prompt
        style: styleString,                         // Style prompt with language diction
        title: songTitle,                           // Title separately
        customMode: true,                           // Enable custom mode for better control
        instrumental: false,
        model: model,                               // Configurable model
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

    // ========== BONUS ACOUSTIC TRACK (parallel generation) ==========
    let bonusResult: { taskId?: string; error?: string } = {};
    
    try {
      // Check if bonus generation is enabled
      const { data: bonusEnabledSetting } = await supabase
        .from("admin_settings")
        .select("value")
        .eq("key", "bonus_song_enabled")
        .maybeSingle();
      
      const bonusEnabled = (bonusEnabledSetting as { value: string } | null)?.value !== "false";
      
      // Skip for free/test orders
      const priceCents = entityType === "order" ? (rawEntity.price_cents as number | null) : null;
      const isFreeOrder = entityType === "order" && (!priceCents || priceCents <= 0);
      
      if (bonusEnabled && !isFreeOrder) {
        // Smart genre detection: if primary is acoustic, use R&B style instead
        const primaryGenre = (entity.genre || "").toLowerCase().trim();
        const isAcousticPrimary = primaryGenre === "acoustic";
        
        let bonusStylePrompt: string;
        let bonusSongTitle: string;
        
        if (isAcousticPrimary) {
          // Primary is acoustic — use R&B style from song_styles table
          const { data: rnbStyle } = await supabase
            .from("song_styles")
            .select("suno_prompt")
            .eq("genre_match", "rnb")
            .eq("vocal_gender", vocalGender)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
          
          if (rnbStyle?.suno_prompt) {
            bonusStylePrompt = rnbStyle.suno_prompt;
            console.log(`[AUDIO] Primary is acoustic — using R&B style for bonus`);
          } else {
            // Fallback if no R&B style found
            bonusStylePrompt = vocalGender === "female"
              ? "Smooth modern R&B ballad, warm soulful female vocal, lush harmonies, subtle 808s, intimate and groove-driven, solo female singer only, no duet, no featured artists, no secondary vocals"
              : "Smooth modern R&B ballad, warm soulful male vocal, lush harmonies, subtle 808s, intimate and groove-driven, solo male singer only, no duet, no featured artists, no secondary vocals";
            console.log(`[AUDIO] No R&B style in song_styles — using hardcoded R&B fallback`);
          }
          bonusSongTitle = `${entity.song_title || `Song for ${entity.recipient_name}`} (R&B Version)`;
        } else {
          // All other genres — use acoustic style
          bonusStylePrompt = vocalGender === "female"
            ? "Raw acoustic singer‑songwriter intimate living‑room feel, imperfect but emotional female vocal with breaths and dynamics left in, lyrics that feel like an honest confession or letter, no big studio polish or heavy effects, mostly dry mix with a touch of natural room reverb, overall vulnerable, organic, \"one take\" performance energy"
            : "Raw acoustic singer‑songwriter intimate living‑room feel, imperfect but emotional male vocal with breaths and dynamics left in, lyrics that feel like an honest confession or letter, no big studio polish or heavy effects, mostly dry mix with a touch of natural room reverb, overall vulnerable, organic, \"one take\" performance energy";
          bonusSongTitle = `${entity.song_title || `Song for ${entity.recipient_name}`} (Acoustic)`;
        }
        
        console.log(`[AUDIO] Firing bonus acoustic track for ${entityType} ${entityId}`);
        console.log(`[AUDIO] Bonus style: ${bonusStylePrompt.substring(0, 60)}...`);
        
        const bonusResponse = await fetch("https://api.kie.ai/api/v1/generate", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${KIE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: stripSunoTags(entity.automation_lyrics),
            style: bonusStylePrompt,
            title: bonusSongTitle,
            customMode: true,
            instrumental: false,
            model: model,
            callBackUrl: callbackUrl,
          }),
        });
        
        if (bonusResponse.ok) {
          const bonusData = await bonusResponse.json();
          if (bonusData?.code === 200 && bonusData?.data?.taskId) {
            const bonusTaskId = bonusData.data.taskId;
            console.log(`[AUDIO] ✅ Bonus task created: ${bonusTaskId}`);
            
            await supabase
              .from(tableName)
              .update({
                bonus_automation_task_id: bonusTaskId,
                bonus_automation_status: "audio_generating",
                bonus_automation_started_at: new Date().toISOString(),
                bonus_style_prompt: bonusStylePrompt,
                bonus_song_title: bonusSongTitle,
              })
              .eq("id", entityId);
            
            bonusResult = { taskId: bonusTaskId };
          } else {
            console.warn(`[AUDIO] Bonus Suno response invalid: ${bonusData?.msg || "No taskId"}`);
            bonusResult = { error: bonusData?.msg || "No taskId returned" };
          }
        } else {
          const errText = await bonusResponse.text();
          console.warn(`[AUDIO] Bonus Suno call failed: ${bonusResponse.status} ${errText.substring(0, 100)}`);
          bonusResult = { error: `HTTP ${bonusResponse.status}` };
        }
      } else {
        console.log(`[AUDIO] Bonus generation skipped (enabled=${bonusEnabled}, isFree=${isFreeOrder})`);
      }
    } catch (bonusErr) {
      console.warn(`[AUDIO] Bonus generation error (non-fatal):`, bonusErr);
      bonusResult = { error: bonusErr instanceof Error ? bonusErr.message : "Unknown error" };
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        entityType,
        entityId,
        taskId,
        model,
        language: languageCode,
        styleUsed: selectedStyle.label || selectedStyle.suno_prompt?.substring(0, 50),
        callbackUrl,
        bonus: bonusResult,
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