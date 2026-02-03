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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      console.error("[LYRICS] KIE_API_KEY not configured");
      throw new Error("KIE_API_KEY not configured");
    }

    const { leadId } = await req.json();
    console.log(`[LYRICS] Starting lyrics generation for lead ${leadId}`);
    
    if (!leadId) {
      console.error("[LYRICS] Missing leadId in request");
      return new Response(
        JSON.stringify({ error: "leadId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch lead data
    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (fetchError || !lead) {
      console.error(`[LYRICS] Lead not found: ${leadId}`, fetchError);
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[LYRICS] Found lead: ${lead.recipient_name} (${lead.recipient_type}), genre: ${lead.genre}`);

    // Check if manual override is set
    if (lead.automation_manual_override_at) {
      console.log(`[LYRICS] Manual override active for lead ${lead.id}, skipping`);
      return new Response(
        JSON.stringify({ error: "Manual override active, skipping automation" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status to lyrics_generating
    await supabase
      .from("leads")
      .update({ 
        automation_status: "lyrics_generating",
        automation_started_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    // Build user prompt with lead data
    const userPrompt = `Write Suno-ready song lyrics only, no explanations.

RecipientType: ${lead.recipient_type}
RecipientName: ${lead.recipient_name}
Occasion: ${lead.occasion}
Genre: ${lead.genre}
SingerPreference: ${lead.singer_preference}
SpecialQualities: "${lead.special_qualities}"
FavoriteMemory: "${lead.favorite_memory}"
SpecialMessage: "${lead.special_message || ""}"

Remember:
- Use structure: Intro – Verse 1 – Chorus – Verse 2 – Chorus – Bridge – Final Chorus – Outro.
- Mention the RecipientName 3-7 times naturally.
- Make it wholesome and heartfelt.`;

    console.log(`[LYRICS] Calling Gemini API, prompt length: ${userPrompt.length} chars`);

    // Call Gemini via Kie.ai (using documented OpenAI-compatible format)
    const geminiResponse = await fetch("https://api.kie.ai/gemini-3-pro/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${KIE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        stream: false,
        messages: [
          { role: "developer", content: SYSTEM_PROMPT },  // Use "developer" role per Gemini 3 Pro docs
          { role: "user", content: userPrompt },
        ],
      }),
    });

    console.log(`[LYRICS] Gemini API response status: ${geminiResponse.status}`);

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error(`[LYRICS] Gemini API error: ${geminiResponse.status}`, errorText);
      
      // Update lead with error
      await supabase
        .from("leads")
        .update({
          automation_status: "failed",
          automation_last_error: `[LYRICS] Gemini API error: ${geminiResponse.status} - ${errorText.substring(0, 200)}`,
          automation_retry_count: (lead.automation_retry_count || 0) + 1,
        })
        .eq("id", leadId);

      return new Response(
        JSON.stringify({ error: "Lyrics generation failed", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiResponse.json();
    console.log(`[LYRICS] Gemini response received, choices: ${geminiData.choices?.length}`);
    
    const lyrics = geminiData.choices?.[0]?.message?.content;

    if (!lyrics) {
      console.error("[LYRICS] No lyrics returned from Gemini");
      await supabase
        .from("leads")
        .update({
          automation_status: "failed",
          automation_last_error: "[LYRICS] No lyrics returned from Gemini API",
          automation_retry_count: (lead.automation_retry_count || 0) + 1,
        })
        .eq("id", leadId);

      return new Response(
        JSON.stringify({ error: "No lyrics generated" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[LYRICS] Generated lyrics length: ${lyrics.length} chars`);

    // Extract title from lyrics (look for first meaningful line after [Intro])
    let songTitle = `Song for ${lead.recipient_name}`;
    const lines = lyrics.split('\n').filter((l: string) => l.trim() && !l.startsWith('['));
    if (lines.length > 0) {
      // Use first line of chorus or verse as title inspiration
      const chorusMatch = lyrics.match(/\[Chorus\]\n([^\n]+)/);
      if (chorusMatch) {
        songTitle = chorusMatch[1].replace(/[,!?]/g, '').trim().substring(0, 50);
      }
    }

    console.log(`[LYRICS] Extracted title: "${songTitle}"`);

    // Update lead with lyrics
    await supabase
      .from("leads")
      .update({
        automation_status: "lyrics_ready",
        automation_lyrics: lyrics,
        song_title: songTitle,
      })
      .eq("id", leadId);

    console.log(`[LYRICS] ✅ Lyrics saved for lead ${leadId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        leadId,
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
