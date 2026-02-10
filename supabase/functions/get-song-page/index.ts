import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateLyricsPreview(lyrics: string): string {
  const lines = lyrics.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return "";
  const preview: string[] = [];
  if (lines[0]) preview.push(lines[0]);
  if (lines[1]) preview.push(lines[1]);
  if (lines[2]) {
    preview.push(lines[2].length > 42 ? lines[2].substring(0, 42) + "…" : lines[2]);
  }
  return preview.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("orderId");

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: "Order ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
      );
    }

    const isShortId = orderId.length === 8;
    const isFullUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);

    if (!isShortId && !isFullUUID) {
      return new Response(
        JSON.stringify({ error: "Invalid order ID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const selectFields = "id, song_url, song_title, cover_image_url, occasion, recipient_name, status, delivered_at, automation_lyrics, lyrics_unlocked_at";

    let orders: any[] | null = null;
    let error: any = null;

    if (isShortId) {
      const result = await supabase
        .from("orders")
        .select(selectFields)
        .eq("status", "delivered")
        .not("song_url", "is", null);

      if (result.error) {
        error = result.error;
      } else {
        orders = result.data?.filter((o: any) =>
          o.id.toLowerCase().startsWith(orderId.toLowerCase())
        ) || [];
      }
    } else {
      const result = await supabase
        .from("orders")
        .select(selectFields)
        .eq("id", orderId)
        .limit(1);

      orders = result.data;
      error = result.error;
    }

    if (error) {
      console.error("Database error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch order" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
      );
    }

    if (!orders || orders.length === 0) {
      return new Response(
        JSON.stringify({ error: "Song not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
      );
    }

    // Collision-safe: exactly 1 match required for short IDs
    if (isShortId && orders.length > 1) {
      return new Response(
        JSON.stringify({ error: "Ambiguous ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
      );
    }

    const order = orders[0];

    if (order.status !== "delivered" || !order.song_url) {
      return new Response(
        JSON.stringify({ error: "Song is not ready yet" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
      );
    }

    const hasLyrics = !!order.automation_lyrics && order.automation_lyrics.trim().length > 0;
    const lyricsUnlocked = !!order.lyrics_unlocked_at;

    const response: Record<string, any> = {
      song_url: order.song_url,
      song_title: order.song_title,
      cover_image_url: order.cover_image_url,
      occasion: order.occasion,
      recipient_name: order.recipient_name,
      has_lyrics: hasLyrics,
      lyrics_unlocked: lyricsUnlocked,
    };

    if (hasLyrics && lyricsUnlocked) {
      response.lyrics = order.automation_lyrics;
    } else if (hasLyrics && !lyricsUnlocked) {
      response.lyrics_preview = generateLyricsPreview(order.automation_lyrics);
    }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Get song page error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  }
});
