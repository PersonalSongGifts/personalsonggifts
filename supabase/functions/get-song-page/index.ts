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

// In-memory per-instance caches.
// - successCache: short TTL on successful 200 responses, lets us absorb
//   bursts of repeat traffic without re-hitting the DB and serve through
//   transient PGRST002 storms.
// - staleCache: longer TTL fallback used ONLY when the DB is currently
//   failing with transient errors after all retries exhaust. Better to
//   serve a slightly stale song page than a 503.
type CachedResponse = { body: string; status: number; expiresAt: number };
const SUCCESS_TTL_MS = 30_000;
const STALE_TTL_MS = 10 * 60_000;
const successCache = new Map<string, CachedResponse>();
const staleCache = new Map<string, CachedResponse>();

function getFresh(key: string): CachedResponse | null {
  const hit = successCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit;
  if (hit) successCache.delete(key);
  return null;
}

function getStale(key: string): CachedResponse | null {
  const hit = staleCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit;
  if (hit) staleCache.delete(key);
  return null;
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

    const cacheKey = orderId.toLowerCase();
    const fresh = getFresh(cacheKey);
    if (fresh) {
      return new Response(fresh.body, {
        status: fresh.status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-Cache": "HIT",
        },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const selectFields = "id, song_url, song_title, cover_image_url, occasion, recipient_name, recipient_name_pronunciation, status, delivered_at, automation_lyrics, lyrics_unlocked_at, download_unlocked_at, revision_token, revision_count, max_revisions, revision_status, sent_at, bonus_song_url, bonus_preview_url, bonus_song_title, bonus_cover_image_url, bonus_unlocked_at, bonus_automation_status, bonus_automation_task_id, bonus_automation_started_at, bonus_style_prompt, genre";

    let orders: any[] | null = null;
    let error: any = null;

    // Retry transient backend errors (e.g. PGRST002 schema cache, 5xx)
    // before giving up. True 404s fall through unchanged.
    const isTransientError = (e: any): boolean => {
      if (!e) return false;
      const code = e.code || "";
      const msg = (e.message || "").toLowerCase();
      return (
        code === "PGRST002" ||
        code === "PGRST001" ||
        code === "08000" || code === "08003" || code === "08006" ||
        code === "57P03" || code === "53300" || code === "XX000" ||
        msg.includes("schema cache") ||
        msg.includes("fetch failed") ||
        msg.includes("timeout") ||
        msg.includes("network") ||
        msg.includes("connection")
      );
    };

    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (isShortId) {
        const result = await supabase.rpc("find_orders_by_short_id", {
          short_id: orderId,
          status_filter: ["delivered", "ready", "completed"],
          require_song_url: true,
          max_results: 2,
        });
        error = result.error;
        orders = result.error ? null : (result.data || []);
      } else {
        const result = await supabase
          .from("orders")
          .select(selectFields)
          .eq("id", orderId)
          .limit(1);
        error = result.error;
        orders = result.data;
      }

      if (!error) break;
      if (!isTransientError(error)) break;
      if (attempt < maxAttempts) {
        console.warn(`get-song-page transient error (attempt ${attempt}):`, error?.code, error?.message);
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }

    if (error) {
      console.error("Database error:", error);
      const stale = getStale(cacheKey);
      if (stale) {
        return new Response(stale.body, {
          status: stale.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "X-Cache": "STALE",
          },
        });
      }
      return new Response(
        JSON.stringify({ error: "Failed to fetch order" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
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

    if (!["delivered", "ready", "completed"].includes(order.status) || !order.song_url) {
      return new Response(
        JSON.stringify({ error: "Song is not ready yet" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
      );
    }

    const hasLyrics = !!order.automation_lyrics && order.automation_lyrics.trim().length > 0;
    const lyricsUnlocked = !!order.lyrics_unlocked_at;

    // Check if revisions feature is enabled (best-effort, non-fatal)
    let revisionAvailable = false;
    let selfServiceEnabled = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { data: revSetting, error: revErr } = await supabase
          .from("admin_settings")
          .select("value")
          .eq("key", "self_service_revisions_enabled")
          .maybeSingle();
        if (revErr) {
          if (isTransientError(revErr) && attempt < 3) {
            await new Promise((r) => setTimeout(r, 200 * attempt));
            continue;
          }
          break;
        }
        selfServiceEnabled = revSetting?.value === "true";
        break;
      } catch { break; }
    }

    if (selfServiceEnabled && order.revision_token) {
      const isPreDelivery = !order.sent_at;
      const hasRevisionsLeft = (order.revision_count || 0) < (order.max_revisions || 1);
      revisionAvailable = isPreDelivery || hasRevisionsLeft;
      // Don't show if already pending or processing
      if (order.revision_status === "pending" || order.revision_status === "processing") {
        revisionAvailable = false;
      }
    }

    const response: Record<string, any> = {
      song_url: order.song_url,
      song_title: order.song_title,
      cover_image_url: order.cover_image_url,
      occasion: order.occasion,
      recipient_name: order.recipient_name,
      has_lyrics: hasLyrics,
      lyrics_unlocked: lyricsUnlocked,
      revision_token: order.revision_token || null,
      revision_available: revisionAvailable,
      revision_status: order.revision_status || null,
      revision_count: order.revision_count || 0,
      delivered_at: order.delivered_at || null,
      download_unlocked: !!order.download_unlocked_at,
      genre: order.genre || null,
      bonus_available: !!(order.bonus_preview_url || order.bonus_song_url),
      bonus_preview_url: order.bonus_preview_url || null,
      bonus_song_url: order.bonus_unlocked_at ? (order.bonus_song_url || null) : null,
      bonus_song_title: order.bonus_song_title || null,
      bonus_cover_image_url: order.bonus_cover_image_url || null,
      bonus_unlocked: !!order.bonus_unlocked_at,
      bonus_status: order.bonus_automation_status || null,
      bonus_asset_version: order.bonus_automation_task_id || order.bonus_automation_started_at || order.bonus_unlocked_at || null,
      bonus_genre_label: (() => {
        const prompt = (order.bonus_style_prompt || "").toLowerCase();
        if (prompt.includes("r&b") || prompt.includes("rnb")) return "R&B";
        if (prompt.includes("acoustic")) return "Acoustic";
        if (order.bonus_song_title?.includes("(R&B")) return "R&B";
        return "Acoustic";
      })(),
    };

    // Auto-swap phonetic name with actual name in displayed lyrics
    const shouldSwapName = order.recipient_name_pronunciation
      && order.recipient_name_pronunciation.trim() !== ""
      && order.recipient_name_pronunciation.toLowerCase() !== order.recipient_name.toLowerCase();

    const swapName = (text: string): string => {
      if (!shouldSwapName) return text;
      const escaped = order.recipient_name_pronunciation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return text.replace(new RegExp("(?<![A-Za-z])" + escaped + "(?![A-Za-z])", "gi"), order.recipient_name);
    };

    if (hasLyrics && lyricsUnlocked) {
      response.lyrics = swapName(order.automation_lyrics);
    } else if (hasLyrics && !lyricsUnlocked) {
      response.lyrics_preview = swapName(generateLyricsPreview(order.automation_lyrics));
    }

    const body = JSON.stringify(response);
    const now = Date.now();
    successCache.set(cacheKey, { body, status: 200, expiresAt: now + SUCCESS_TTL_MS });
    staleCache.set(cacheKey, { body, status: 200, expiresAt: now + STALE_TTL_MS });

    return new Response(
      body,
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store", "X-Cache": "MISS" } }
    );
  } catch (error) {
    console.error("Get song page error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  }
});
