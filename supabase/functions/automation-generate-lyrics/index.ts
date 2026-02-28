import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { logActivity } from "../_shared/activity-log.ts";
import {
  getLanguageLabel,
  buildLanguagePromptBlock,
  buildRetryLanguagePromptBlock,
  runBasicQA,
  truncateForStorage,
  type LanguageQAResult,
} from "../_shared/language-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are CustomSong-GPT, a professional lyricist who writes Suno-ready custom song lyrics based on structured order form data.

# Your Job
Take structured inputs (recipient, occasion, genre, singer preference, and text fields) and output final, polished lyrics only, ready to paste into Suno with clear section headings.

# Overall Goals
- Make each song feel deeply personal to the recipient.
- Clearly mention the recipient's name several times (3-7 times), but not spammy.
- Thoughtfully weave in all buyer-provided details: Special Qualities, Favorite Memory, Special Message.
- Match the selected genre in tone and style.
- Default tone: wholesome, sweet, nostalgic.

# Song Structure
Always write lyrics in this structure:
1. [Intro] - 1-4 short lines
2. [Verse 1] - 4-6 lines
3. [Chorus] - 4-6 lines with hook
4. [Verse 2] - 4-6 lines
5. [Chorus]
6. [Bridge] - 2-4 lines
7. [Final Chorus] - strongest/biggest
8. [Outro] - 1-4 short lines

Target a typical 3:00-3:30 song. Keep line lengths short and singable (4-10 words per line).

# Genre Vibes
- Pop/Acoustic: Emotional clarity, intimate
- Country: Storytelling, down-to-earth, nostalgic
- Prayer/Worship: Reverent, intimate conversation with God, gratitude and trust, congregational chorus hook
- Rock: Energy, anthemic choruses, powerful
- R&B: Smooth, soulful, romantic
- Jazz: Poetic, sophisticated, late-night vibes
- Hip-Hop: Strong rhythm, internal rhymes, keep it PG-13
- Indie Folk: Quirky, poetic, nostalgic
- Latin Pop: Passionate, rhythmic
- K-Pop: Hook-focused, bright, energetic
- EDM: Fewer words, repetitive, high-energy

# Field Usage
- RecipientType: Shapes relationship tone (romantic for spouse, grateful for parent, playful for friend, cute for pet)
- RecipientName: Emotional center, use 3-7 times naturally
- Occasion: Reference directly, influences overall tone
- SpecialQualities: Spread across verses and chorus, paraphrase into natural lyrics
- FavoriteMemory: Turn into a mini-scene in verse or bridge with concrete details
- SpecialMessage: Integrate in bridge or closing lines

# Detail Fidelity (CRITICAL)
- Preserve the EXACT meaning of life events: proposals, weddings, births, deaths, diagnoses
- If input says someone "proposed" or "asked to marry," the lyrics MUST reflect a marriage proposal -- never paraphrase into something vaguer
- When input describes WHO did WHAT, maintain correct attribution (who proposed to whom, who said what)
- Prefer the customer's own phrasing for key moments over poetic alternatives
- Specific dates/years should be preserved when mentioned
- When in doubt, stay closer to the original wording

# No Fabrication (CRITICAL)
- NEVER invent physical traits (eye color, hair color, height, skin tone, body type)
  unless the buyer explicitly described them in SpecialQualities or FavoriteMemory
- NEVER invent specific locations, cities, or place names unless the buyer mentioned them
- NEVER invent hobbies, jobs, or personality traits not referenced in the input
- If the input is vague, keep the lyrics emotionally specific but physically generic
- Use universal sensory details instead: "your smile," "your laugh," "the sound of your voice,"
  "the way you light up a room" -- NOT "your blue eyes" or "your golden hair"
- When in doubt, describe HOW someone makes people FEEL, not how they LOOK

# Cultural Sensitivity (CRITICAL)
- NEVER reference alcohol (wine, beer, champagne, cocktails, toasting, drinking)
  unless the buyer explicitly mentioned it in their input
- NEVER reference specific religious practices, dietary customs, or cultural rituals
  unless the buyer referenced them
- Avoid assumptions about lifestyle based on name, ethnicity, or region
- Safe universal alternatives for celebration: "raise a glass" -> "celebrate tonight";
  "champagne" -> "confetti"; "wine" -> "favorite song"; "bar" -> "dance floor"
- When the genre is Prayer/Worship, keep references non-denominational unless
  the buyer specified a faith tradition

# Formatting
- Use [Section Name] labels exactly
- One line of lyrics per line
- Avoid overusing punctuation
- You may use repetitions for hooks and vocalizations (oh, ooooh, la la la)

# Sender Context
- If SenderContext is provided, use it to determine the correct gender perspective
- NEVER assume sender gender from RecipientType alone
  (e.g., "wife" does not mean the sender is male)
- When no SenderContext is given, keep gender references neutral
  or use universal phrases like "you make me better" instead of "you make me a better man"

# Rules
- If input has typos/fragments, infer meaning and clean up spelling/grammar, but NEVER change the meaning of what happened
- Prioritize safety and wholesome tone
- Do NOT explain reasoning or ask questions
- Output lyrics ONLY in the specified format`;

// Helper to normalize entity data from leads or orders
interface EntityData {
  id: string;
  recipient_type: string;
  recipient_name: string;
  recipient_name_pronunciation: string | null;
  occasion: string;
  genre: string;
  singer_preference: string;
  special_qualities: string;
  favorite_memory: string;
  special_message?: string | null;
  automation_manual_override_at?: string | null;
  automation_retry_count?: number | null;
  lyrics_language_code: string;
  sender_context?: string | null;
  notes?: string | null;
}

function normalizeEntityData(entity: Record<string, unknown>): EntityData {
  return {
    id: entity.id as string,
    recipient_type: entity.recipient_type as string,
    recipient_name: entity.recipient_name as string,
    recipient_name_pronunciation: entity.recipient_name_pronunciation as string | null,
    occasion: entity.occasion as string,
    genre: entity.genre as string,
    singer_preference: entity.singer_preference as string,
    special_qualities: entity.special_qualities as string,
    favorite_memory: entity.favorite_memory as string,
    special_message: entity.special_message as string | null,
    automation_manual_override_at: entity.automation_manual_override_at as string | null,
    automation_retry_count: entity.automation_retry_count as number | null,
    lyrics_language_code: (entity.lyrics_language_code as string) || "en",
    sender_context: entity.sender_context as string | null,
    notes: entity.notes as string | null,
  };
}

async function generateLyrics(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<{ lyrics: string | null; error: string | null }> {
  const geminiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    return { lyrics: null, error: `Gemini API error: ${geminiResponse.status} - ${errorText.substring(0, 200)}` };
  }

  const geminiData = await geminiResponse.json();
  const lyrics = geminiData.choices?.[0]?.message?.content;

  if (!lyrics) {
    return { lyrics: null, error: "No lyrics returned from Gemini API" };
  }

  return { lyrics, error: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[LYRICS] LOVABLE_API_KEY not configured");
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const { leadId, orderId } = await req.json();
    
    // Determine entity type
    const entityType = orderId ? "order" : "lead";
    const entityId = orderId || leadId;
    const tableName = entityType === "order" ? "orders" : "leads";
    
    console.log(`[LYRICS] Starting lyrics generation for ${entityType} ${entityId}`);
    
    if (!entityId) {
      console.error("[LYRICS] Missing entityId in request");
      return new Response(
        JSON.stringify({ error: "leadId or orderId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch entity data
    const { data: rawEntity, error: fetchError } = await supabase
      .from(tableName)
      .select("*")
      .eq("id", entityId)
      .maybeSingle();

    if (fetchError || !rawEntity) {
      console.error(`[LYRICS] ${entityType} not found: ${entityId}`, fetchError);
      return new Response(
        JSON.stringify({ error: `${entityType} not found` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const entity = normalizeEntityData(rawEntity);
    const languageCode = entity.lyrics_language_code;
    const languageLabel = getLanguageLabel(languageCode);
    
    console.log(`[LYRICS] Found ${entityType}: ${entity.recipient_name} (${entity.recipient_type}), genre: ${entity.genre}, language: ${languageLabel}`);

    // Check if manual override is set (must be BEFORE audio guard so admin overrides always work)
    if (entity.automation_manual_override_at) {
      console.log(`[LYRICS] Manual override active for ${entityType} ${entity.id}, skipping`);
      return new Response(
        JSON.stringify({ error: "Manual override active, skipping automation" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Guard: Pending revision — discard stale lyrics generation
    if (entityType === "order" && rawEntity.pending_revision) {
      console.log(`[LYRICS] ⚠️ Pending revision for order ${entity.id}, discarding stale lyrics generation`);
      await supabase
        .from("orders")
        .update({
          automation_status: "failed",
          automation_last_error: "[LYRICS] Discarded: revision pending, stale lyrics result",
          automation_task_id: null,
        })
        .eq("id", entity.id);
      return new Response(
        JSON.stringify({ error: "Revision pending, discarding stale generation" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Guard: never regenerate lyrics when audio already exists — would create a mismatch
    const audioUrl = rawEntity.song_url || rawEntity.full_song_url;
    if (audioUrl) {
      console.log(`[LYRICS] Audio already exists for ${entityType} ${entityId}, skipping to preserve pairing`);
      return new Response(
        JSON.stringify({ error: "Audio already generated, lyrics locked" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status to lyrics_generating
    await supabase
      .from(tableName)
      .update({ 
        automation_status: "lyrics_generating",
        automation_started_at: new Date().toISOString(),
      })
      .eq("id", entityId);

    // Build user prompt with entity data
    // If pronunciation override exists, use it ONLY (display name never enters the prompt)
    const recipientNameForLyrics = entity.recipient_name_pronunciation || entity.recipient_name;
    
    const pronunciationInstruction = entity.recipient_name_pronunciation 
      ? `\n\nIMPORTANT PRONUNCIATION:
When singing the recipient's name, use exactly: "${entity.recipient_name_pronunciation}"
This spelling is intentional for correct pronunciation and must be followed.`
      : "";

    // Add language-specific prompt block
    const languagePromptBlock = buildLanguagePromptBlock(languageCode);

    // Build sender context block if available
    const senderCtx = [entity.sender_context, entity.notes].filter(Boolean).join("\n\n");
    const senderContextBlock = senderCtx
      ? `\nSenderContext: "${senderCtx}"\n\nIMPORTANT: The sender has provided context about themselves.\nUse this to ensure correct gender references and perspective in the lyrics.\nNever assume the sender's gender from the recipient type alone.`
      : "";

    const userPrompt = `Write Suno-ready song lyrics only, no explanations.

RecipientType: ${entity.recipient_type}
RecipientName: ${recipientNameForLyrics}
Occasion: ${entity.occasion}
Genre: ${entity.genre}
SingerPreference: ${entity.singer_preference}
SpecialQualities: "${entity.special_qualities}"
FavoriteMemory: "${entity.favorite_memory}"
SpecialMessage: "${entity.special_message || ""}"
${pronunciationInstruction}
${senderContextBlock}
${languagePromptBlock}

Remember:
- Use structure: Intro – Verse 1 – Chorus – Verse 2 – Chorus – Bridge – Final Chorus – Outro.
- Mention the RecipientName 3-7 times naturally.
- Make it wholesome and heartfelt.`;

    console.log(`[LYRICS] Calling Gemini API, prompt length: ${userPrompt.length} chars, language: ${languageCode}`);

    // ========== ATTEMPT 1 ==========
    const attempt1Result = await generateLyrics(LOVABLE_API_KEY, SYSTEM_PROMPT, userPrompt);
    
    if (attempt1Result.error) {
      console.error(`[LYRICS] Attempt 1 failed: ${attempt1Result.error}`);
      
      await supabase
        .from(tableName)
        .update({
          automation_status: "failed",
          automation_last_error: `[LYRICS] ${attempt1Result.error}`,
          automation_retry_count: (entity.automation_retry_count || 0) + 1,
        })
        .eq("id", entityId);

      return new Response(
        JSON.stringify({ error: "Lyrics generation failed", details: attempt1Result.error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lyrics1 = attempt1Result.lyrics!;
    console.log(`[LYRICS] Attempt 1 generated, length: ${lyrics1.length} chars`);

    // Run QA on attempt 1
    const qa1 = runBasicQA(lyrics1, languageCode, 1);
    console.log(`[LYRICS] QA Attempt 1: passed=${qa1.passed}, issues=${qa1.issues.join("; ")}`);

    let finalLyrics = lyrics1;
    let finalQA: LanguageQAResult = qa1;
    let lyrics2: string | null = null;
    let qa2: LanguageQAResult | null = null;

    // If QA failed and language is not English, retry with stronger prompt
    if (!qa1.passed && languageCode !== "en") {
      console.log(`[LYRICS] Attempt 1 QA failed, retrying with stronger language prompt`);
      
      // Store attempt 1
      await supabase
        .from(tableName)
        .update({
          lyrics_raw_attempt_1: truncateForStorage(lyrics1),
        })
        .eq("id", entityId);

      // Build retry prompt with issues
      const retryLanguageBlock = buildRetryLanguagePromptBlock(languageCode, qa1.issues);
      
      const retryUserPrompt = `Write Suno-ready song lyrics only, no explanations.

RecipientType: ${entity.recipient_type}
RecipientName: ${recipientNameForLyrics}
Occasion: ${entity.occasion}
Genre: ${entity.genre}
SingerPreference: ${entity.singer_preference}
SpecialQualities: "${entity.special_qualities}"
FavoriteMemory: "${entity.favorite_memory}"
SpecialMessage: "${entity.special_message || ""}"
${pronunciationInstruction}
${senderContextBlock}
${retryLanguageBlock}

Remember:
- Use structure: Intro – Verse 1 – Chorus – Verse 2 – Chorus – Bridge – Final Chorus – Outro.
- Mention the RecipientName 3-7 times naturally.
- Make it wholesome and heartfelt.`;

      const attempt2Result = await generateLyrics(LOVABLE_API_KEY, SYSTEM_PROMPT, retryUserPrompt);
      
      if (attempt2Result.error) {
        console.error(`[LYRICS] Attempt 2 failed: ${attempt2Result.error}`);
        // Continue with attempt 1 lyrics even though QA failed
      } else {
        lyrics2 = attempt2Result.lyrics!;
        console.log(`[LYRICS] Attempt 2 generated, length: ${lyrics2.length} chars`);
        
        // Run QA on attempt 2
        qa2 = runBasicQA(lyrics2, languageCode, 2);
        console.log(`[LYRICS] QA Attempt 2: passed=${qa2.passed}, issues=${qa2.issues.join("; ")}`);
        
        // Use attempt 2 if it passed, or if it's better than attempt 1
        if (qa2.passed) {
          finalLyrics = lyrics2;
          finalQA = qa2;
        }
      }
    }

    // Store raw attempts and QA results
    const qaResultToStore = {
      attempt1: {
        passed: qa1.passed,
        detection: qa1.detection,
        mixed_language_check: qa1.mixed_language_check,
        issues: qa1.issues,
      },
      attempt2: qa2 ? {
        passed: qa2.passed,
        detection: qa2.detection,
        mixed_language_check: qa2.mixed_language_check,
        issues: qa2.issues,
      } : null,
      final_passed: finalQA.passed,
      detection_sample: finalQA.detection.detection_sample,
      timestamp: new Date().toISOString(),
    };

    // Check if both attempts failed (for non-English)
    const bothFailed = !qa1.passed && (!qa2 || !qa2.passed) && languageCode !== "en";
    
    if (bothFailed) {
      console.log(`[LYRICS] ❌ Both attempts failed QA for ${languageCode}, marking needs_review`);
      
      await supabase
        .from(tableName)
        .update({
          automation_status: "needs_review",
          automation_last_error: `Language QA failed: ${finalQA.issues.join("; ")}`,
          lyrics_raw_attempt_1: truncateForStorage(lyrics1),
          lyrics_raw_attempt_2: truncateForStorage(lyrics2),
          lyrics_language_qa: qaResultToStore,
        })
        .eq("id", entityId);

      return new Response(
        JSON.stringify({ 
          success: false, 
          entityType,
          entityId,
          status: "needs_review",
          reason: "Language QA failed",
          issues: finalQA.issues,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract title from lyrics (look for first meaningful line after [Intro])
    let songTitle = `Song for ${entity.recipient_name}`;
    const lines = finalLyrics.split('\n').filter((l: string) => l.trim() && !l.startsWith('['));
    if (lines.length > 0) {
      // Use first line of chorus or verse as title inspiration
      const chorusMatch = finalLyrics.match(/\[Chorus\]\n([^\n]+)/);
      if (chorusMatch) {
        songTitle = chorusMatch[1].replace(/[,!?]/g, '').trim().substring(0, 50);
      }
    }

    console.log(`[LYRICS] Extracted title: "${songTitle}"`);

    // Update entity with lyrics and QA results
    await supabase
      .from(tableName)
      .update({
        automation_status: "lyrics_ready",
        automation_lyrics: finalLyrics,
        song_title: songTitle,
        lyrics_raw_attempt_1: truncateForStorage(lyrics1),
        lyrics_raw_attempt_2: truncateForStorage(lyrics2),
        lyrics_language_qa: qaResultToStore,
      })
      .eq("id", entityId);

    console.log(`[LYRICS] ✅ Lyrics saved for ${entityType} ${entityId} (language: ${languageLabel}, QA: ${finalQA.passed ? "passed" : "passed with warnings"})`);

    await logActivity(supabase, entityType as "order" | "lead", entityId, "lyrics_generated", "system", `Lyrics generated, ${finalLyrics.length} chars, language: ${languageLabel}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        entityType,
        entityId,
        title: songTitle,
        language: languageCode,
        languageLabel,
        lyricsLength: finalLyrics.length,
        qaPassed: finalQA.passed,
        lyrics: finalLyrics.substring(0, 200) + "...",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[LYRICS] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});