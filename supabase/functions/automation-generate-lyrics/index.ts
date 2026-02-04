import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

# Formatting
- Use [Section Name] labels exactly
- One line of lyrics per line
- Avoid overusing punctuation
- You may use repetitions for hooks and vocalizations (oh, ooooh, la la la)

# Rules
- If input has typos/fragments, infer meaning and clean up
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
}

function normalizeEntityData(entity: Record<string, unknown>, entityType: "lead" | "order"): EntityData {
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
  };
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
      .single();

    if (fetchError || !rawEntity) {
      console.error(`[LYRICS] ${entityType} not found: ${entityId}`, fetchError);
      return new Response(
        JSON.stringify({ error: `${entityType} not found` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const entity = normalizeEntityData(rawEntity, entityType);
    console.log(`[LYRICS] Found ${entityType}: ${entity.recipient_name} (${entity.recipient_type}), genre: ${entity.genre}`);

    // Check if manual override is set
    if (entity.automation_manual_override_at) {
      console.log(`[LYRICS] Manual override active for ${entityType} ${entity.id}, skipping`);
      return new Response(
        JSON.stringify({ error: "Manual override active, skipping automation" }),
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

Remember:
- Use structure: Intro – Verse 1 – Chorus – Verse 2 – Chorus – Bridge – Final Chorus – Outro.
- Mention the RecipientName 3-7 times naturally.
- Make it wholesome and heartfelt.`;

    console.log(`[LYRICS] Calling Gemini API, prompt length: ${userPrompt.length} chars`);

    // Call Gemini via Lovable AI Gateway (standard OpenAI-compatible format)
    const geminiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        stream: false,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    console.log(`[LYRICS] Gemini API response status: ${geminiResponse.status}`);

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error(`[LYRICS] Gemini API error: ${geminiResponse.status}`, errorText);
      
      // Update entity with error
      await supabase
        .from(tableName)
        .update({
          automation_status: "failed",
          automation_last_error: `[LYRICS] Gemini API error: ${geminiResponse.status} - ${errorText.substring(0, 200)}`,
          automation_retry_count: (entity.automation_retry_count || 0) + 1,
        })
        .eq("id", entityId);

      return new Response(
        JSON.stringify({ error: "Lyrics generation failed", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiResponse.json();
    console.log(`[LYRICS] Gemini response received, choices: ${geminiData.choices?.length}`);
    
    const lyrics = geminiData.choices?.[0]?.message?.content;

    if (!lyrics) {
      console.error("[LYRICS] No lyrics returned. Response structure:", JSON.stringify(geminiData).substring(0, 500));
      await supabase
        .from(tableName)
        .update({
          automation_status: "failed",
          automation_last_error: "[LYRICS] No lyrics returned from Gemini API",
          automation_retry_count: (entity.automation_retry_count || 0) + 1,
        })
        .eq("id", entityId);

      return new Response(
        JSON.stringify({ error: "No lyrics generated" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[LYRICS] Generated lyrics length: ${lyrics.length} chars`);

    // Extract title from lyrics (look for first meaningful line after [Intro])
    let songTitle = `Song for ${entity.recipient_name}`;
    const lines = lyrics.split('\n').filter((l: string) => l.trim() && !l.startsWith('['));
    if (lines.length > 0) {
      // Use first line of chorus or verse as title inspiration
      const chorusMatch = lyrics.match(/\[Chorus\]\n([^\n]+)/);
      if (chorusMatch) {
        songTitle = chorusMatch[1].replace(/[,!?]/g, '').trim().substring(0, 50);
      }
    }

    console.log(`[LYRICS] Extracted title: "${songTitle}"`);

    // Update entity with lyrics
    await supabase
      .from(tableName)
      .update({
        automation_status: "lyrics_ready",
        automation_lyrics: lyrics,
        song_title: songTitle,
      })
      .eq("id", entityId);

    console.log(`[LYRICS] ✅ Lyrics saved for ${entityType} ${entityId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        entityType,
        entityId,
        title: songTitle,
        lyricsLength: lyrics.length,
        lyrics: lyrics.substring(0, 200) + "...",
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
