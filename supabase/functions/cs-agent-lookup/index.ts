import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { validateCsAgentKey } from "../_shared/cs-agent-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cs-agent-key",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Inline auth check for debugging
  const providedKey = req.headers.get("x-cs-agent-key");
  const expectedKey = Deno.env.get("CS_AGENT_KEY");
  console.log(`[CS-AUTH] provided="${providedKey}", expectedLen=${expectedKey?.length}`);
  if (!validateCsAgentKey(req)) return json({ error: "unauthorized" }, 403);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "lookup_by_email":
        return await lookupByEmail(supabase, body);
      case "lookup_order":
        return await lookupOrder(supabase, body);
      case "check_song":
        return await checkSong(supabase, body);
      case "get_preview_link":
        return await getPreviewLink(supabase, body);
      case "get_revision_requests":
        return await getRevisionRequests(supabase, body);
      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    console.error("[cs-agent-lookup] Error:", e);
    return json({ error: e instanceof Error ? e.message : "server_error" }, 500);
  }
});

// ── lookup_by_email ──
async function lookupByEmail(supabase: ReturnType<typeof createClient>, body: { email?: string }) {
  const email = body.email?.trim()?.toLowerCase();
  if (!email) return json({ error: "email required" }, 400);

  const orderFields = "id, status, pricing_tier, recipient_name, occasion, genre, singer_preference, automation_status, song_url, song_title, cover_image_url, created_at, delivered_at, expected_delivery, revision_count, max_revisions, revision_token, automation_lyrics, delivery_status";
  const leadFields = "id, status, recipient_name, preview_token, preview_song_url, full_song_url, quality_score, converted_at, preview_sent_at, follow_up_sent_at";

  const [ordersRes, leadsRes] = await Promise.all([
    supabase.from("orders").select(orderFields).ilike("customer_email", email).order("created_at", { ascending: false }).limit(50),
    supabase.from("leads").select(leadFields).ilike("email", email).order("captured_at", { ascending: false }).limit(50),
  ]);

  return json({
    orders: ordersRes.data || [],
    leads: leadsRes.data || [],
    orders_count: ordersRes.data?.length || 0,
    leads_count: leadsRes.data?.length || 0,
  });
}

// ── lookup_order ──
async function lookupOrder(supabase: ReturnType<typeof createClient>, body: { order_id?: string }) {
  const shortId = body.order_id?.trim()?.toUpperCase();
  if (!shortId) return json({ error: "order_id required" }, 400);

  const { data, error } = await supabase
    .from("orders")
    .select("id, status, pricing_tier, recipient_name, occasion, genre, singer_preference, automation_status, song_url, song_title, cover_image_url, created_at, delivered_at, expected_delivery, revision_count, max_revisions, revision_token, automation_lyrics, delivery_status, special_qualities, favorite_memory, special_message, automation_last_error, automation_retry_count, prev_song_url, prev_automation_lyrics, customer_name, customer_email, customer_phone")
    .ilike("id::text", `${shortId}%`)
    .limit(5);

  if (error) return json({ error: error.message }, 500);
  if (!data || data.length === 0) return json({ error: "order_not_found" }, 404);

  return json({ orders: data, count: data.length });
}

// ── check_song ──
async function checkSong(supabase: ReturnType<typeof createClient>, body: { order_id?: string }) {
  const shortId = body.order_id?.trim()?.toUpperCase();
  if (!shortId) return json({ error: "order_id required" }, 400);

  const { data, error } = await supabase
    .from("orders")
    .select("id, song_url, song_title, cover_image_url, automation_lyrics, automation_status, song_play_count, song_played_at, song_downloaded_at")
    .ilike("id::text", `${shortId}%`)
    .limit(1)
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: "order_not_found" }, 404);

  const songAvailable = !!data.song_url && data.song_url.length > 0;

  return json({
    ...data,
    song_available: songAvailable,
  });
}

// ── get_preview_link ──
async function getPreviewLink(supabase: ReturnType<typeof createClient>, body: { email?: string }) {
  const email = body.email?.trim()?.toLowerCase();
  if (!email) return json({ error: "email required" }, 400);

  const { data, error } = await supabase
    .from("leads")
    .select("id, preview_token, recipient_name, preview_played_at, preview_play_count, follow_up_sent_at")
    .ilike("email", email)
    .not("preview_token", "is", null)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: "no_preview_found" }, 404);

  return json({
    ...data,
    preview_url: `https://www.personalsonggifts.com/preview/${data.preview_token}`,
  });
}

// ── get_revision_requests ──
async function getRevisionRequests(supabase: ReturnType<typeof createClient>, body: { order_id?: string }) {
  const shortId = body.order_id?.trim()?.toUpperCase();
  if (!shortId) return json({ error: "order_id required" }, 400);

  // First find the full order ID
  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .ilike("id::text", `${shortId}%`)
    .limit(1)
    .maybeSingle();

  if (!order) return json({ error: "order_not_found" }, 404);

  const { data, error } = await supabase
    .from("revision_requests")
    .select("*")
    .eq("order_id", order.id)
    .order("submitted_at", { ascending: false });

  if (error) return json({ error: error.message }, 500);

  return json({ revision_requests: data || [], count: data?.length || 0 });
}
