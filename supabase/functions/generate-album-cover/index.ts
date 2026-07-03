import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function genreStyle(genreRaw: string | null | undefined): string {
  const g = (genreRaw || "").toLowerCase().trim();
  if (g.includes("country")) return "Warm natural golden-hour Americana atmosphere, rustic textures, hand-crafted classic serif title.";
  if (g.includes("rnb") || g.includes("r&b") || g.includes("soul")) return "Moody deep plum and midnight-blue palette with warm gold accents, sleek elegant modern serif title, glossy cinematic lighting.";
  if (g.includes("rock")) return "Cinematic, bold, high-contrast lighting, distressed condensed sans-serif title, gritty texture.";
  if (g.includes("acoustic") || g.includes("folk")) return "Soft warm intimate light, organic textures, understated hand-set serif title.";
  if (g.includes("rap") || g.includes("hip")) return "Bold graphic composition, confident modern sans-serif title, high-contrast urban tones.";
  if (g.includes("jazz")) return "Classy vintage warm palette, subtle grain, elegant italic serif title, smoky lighting.";
  if (g.includes("kpop") || g.includes("k-pop") || g.includes("edm") || g.includes("dance")) return "Vibrant, energetic, glossy neon-tinted lighting, sleek geometric sans-serif title.";
  if (g.includes("prayer") || g.includes("worship") || g.includes("gospel")) return "Serene warm radiant light, soft heavenly glow, reverent classic serif title.";
  if (g.includes("lullaby")) return "Soft pastel palette, gentle dreamy blur, delicate rounded serif title.";
  if (g.includes("latin")) return "Warm vibrant romantic tones, sun-kissed light, expressive elegant serif title.";
  if (g.includes("bollywood")) return "Rich ornate jewel tones, gold filigree accents, elegant serif title.";
  if (g.includes("pop")) return "Luminous, airy, bright soft light rays and glow, clean modern sans-serif title.";
  return "Warm, elegant, timeless palette with tasteful modern serif title.";
}

function occasionGuardrail(occRaw: string | null | undefined): string {
  const o = (occRaw || "").toLowerCase().trim();
  if (o.includes("memorial") || o.includes("memory of") || o.includes("in loving") || o.includes("pet-memorial") || o.includes("pet memorial")) return "MEMORIAL — reverent remembrance ONLY. Tender, soft, muted palette (dusty rose, ivory, warm grey, gentle golden light). Absolutely no celebratory or peppy cues, no confetti, no bright neon, no upbeat/energetic styling, no cheerful taglines or slogans. This guardrail OVERRIDES the genre's usual upbeat treatment — even if the genre style suggests vibrant/glossy/energetic looks, keep it hushed, dignified and respectful. Serene, still, memorial-portrait feeling.";
  if (o.includes("birthday")) return "Warm, celebratory but tasteful mood.";
  if (o.includes("anniversary") || o.includes("valentine") || o.includes("proposal") || o.includes("wedding")) return "Romantic, intimate, tender mood.";
  if (o.includes("mother")) return "Warm, heartfelt, loving mood.";
  if (o.includes("father")) return "Warm, heartfelt, strong mood.";
  if (o.includes("graduation") || o.includes("retirement") || o.includes("milestone") || o.includes("promotion")) return "Proud, uplifting, aspirational mood.";
  if (o.includes("pet")) return "Warm, sweet, gentle mood.";
  return "Warm, sincere, personal mood.";
}

function buildPrompt(args: { title: string; recipient: string; genre: string; occasion: string }): string {
  const style = genreStyle(args.genre);
  const guard = occasionGuardrail(args.occasion);
  const title = (args.title || "").trim() || `A Song for ${args.recipient || "You"}`;
  return [
    "Design a premium square 1:1 music single album cover from the uploaded photo.",
    `LIKENESS LOCK: Keep the person's face, features, glasses, wrinkles, hair, skin tone, body and expression EXACTLY as in the uploaded photo. Do not beautify, smooth, slim, re-age or restyle them, and keep their real setting. Apply ALL styling as lighting, color grade, atmosphere, typography and framing AROUND them, never by altering them. They are a real person for a personal gift.`,
    `COMPOSITION: Balanced square 1:1 album cover; the person prominent and FULLY in frame, not cut off; title readable and not covering their face; premium, like a real released single.`,
    `GENRE STYLE (${args.genre || "default"}): ${style}`,
    `OCCASION GUARDRAIL (${args.occasion || "default"}): ${guard}`,
    `TITLE RENDERING: Render the song title EXACTLY as: "${title}" — every word, spelled correctly, no substitutions, no truncation, no invented text. Break it naturally across one to three lines if it is long; keep it prominent, legible and well-sized (a real album-cover title, not tiny). Place it tastefully so it does not cover the person's face. Do NOT add any other text, subtitle, artist name, or tagline.`,
    "No watermarks, no logos, no borders, no extra text besides the title.",
  ].join("\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) throw new Error("KIE_API_KEY not configured");
    const body = await req.json();
    const { orderId, photoUrl } = body;
    const variant: "main" | "bonus" = body.variant === "bonus" ? "bonus" : "main";
    if (!orderId || !photoUrl) {
      return new Response(JSON.stringify({ error: "orderId and photoUrl required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, genre, occasion, song_title, recipient_name, bonus_song_title, bonus_style_prompt")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let promptGenre: string;
    let promptTitle: string;
    if (variant === "bonus") {
      const bp = (order.bonus_style_prompt || "").toLowerCase();
      const bonusIsRnb = bp.includes("r&b") || bp.includes("rnb") || (order.bonus_song_title || "").includes("(R&B");
      promptGenre = bonusIsRnb ? "rnb" : "acoustic";
      promptTitle = order.bonus_song_title || `${order.song_title || ""} (Acoustic)`;
    } else {
      promptGenre = order.genre || "";
      promptTitle = order.song_title || "";
    }
    const prompt = buildPrompt({
      title: promptTitle,
      recipient: order.recipient_name || "",
      genre: promptGenre,
      occasion: order.occasion || "",
    });

    const kieRes = await fetch("https://api.kie.ai/api/v1/gpt4o-image/generate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${KIE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, filesUrl: [photoUrl], size: "1:1" }),
    });
    const kieJson = await kieRes.json().catch(() => ({}));
    if (!kieRes.ok) {
      console.error("[album-cover] Kie error", kieRes.status, kieJson);
      return new Response(JSON.stringify({ error: "Kie generate failed", detail: kieJson }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const taskId = kieJson?.data?.taskId || kieJson?.taskId;
    if (!taskId) {
      return new Response(JSON.stringify({ error: "No taskId returned", detail: kieJson }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (variant === "bonus") {
      await supabase.from("orders").update({
        album_cover_bonus_task_id: taskId,
        album_cover_bonus_status: "generating",
        album_cover_bonus_url: null,
      }).eq("id", orderId);
    } else {
      await supabase.from("orders").update({
        album_cover_task_id: taskId,
        album_cover_status: "generating",
        album_cover_photo_url: photoUrl,
        album_cover_url: null,
      }).eq("id", orderId);
    }

    return new Response(JSON.stringify({ taskId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("[album-cover] error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});