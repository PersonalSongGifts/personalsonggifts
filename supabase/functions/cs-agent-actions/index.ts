import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { validateCsAgentKey } from "../_shared/cs-agent-auth.ts";
import { logActivity } from "../_shared/activity-log.ts";

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

  if (!validateCsAgentKey(req)) return json({ error: "unauthorized" }, 403);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "regenerate_song":
        return await regenerateSong(supabase, supabaseUrl, supabaseServiceKey, body);
      case "update_lyrics":
        return await updateLyrics(supabase, body);
      case "resend_delivery":
        return await resendDelivery(supabase, supabaseUrl, supabaseServiceKey, body);
      case "send_preview_link":
        return await sendPreviewLink(supabase, supabaseUrl, supabaseServiceKey, body);
      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    console.error("[cs-agent-actions] Error:", e);
    return json({ error: e instanceof Error ? e.message : "server_error" }, 500);
  }
});

// Helper: find order by short ID using the database function
async function findOrder(supabase: ReturnType<typeof createClient>, shortId: string) {
  const { data } = await supabase.rpc("find_orders_by_short_id", {
    short_id: shortId.toUpperCase(),
    status_filter: null,
    require_song_url: false,
    max_results: 1,
  });
  return data?.[0] || null;
}

// ── regenerate_song ──
async function regenerateSong(
  supabase: ReturnType<typeof createClient>,
  _url: string, _key: string,
  body: { order_id?: string; pronunciation_hints?: string; lyrics_override?: string }
) {
  if (!body.order_id) return json({ error: "order_id required" }, 400);

  const order = await findOrder(supabase, body.order_id);
  if (!order) return json({ error: "order_not_found" }, 404);

  // Must be a paid order (exists in orders table = paid)
  const allowedStatuses = ["in_progress", "ready", "delivered"];
  if (!allowedStatuses.includes(order.status)) {
    return json({ error: `Cannot regenerate order with status '${order.status}'. Allowed: ${allowedStatuses.join(", ")}` }, 422);
  }

  // Build update payload
  const update: Record<string, unknown> = {
    prev_song_url: order.song_url,
    prev_automation_lyrics: order.automation_lyrics,
    prev_cover_image_url: order.cover_image_url,
    automation_status: "pending",
    automation_task_id: null,
    automation_retry_count: 0,
    automation_last_error: null,
    automation_started_at: null,
    generated_at: null,
  };

  if (body.lyrics_override) {
    update.automation_lyrics = body.lyrics_override;
  }

  if (body.pronunciation_hints) {
    const existing = order.special_message || "";
    const separator = existing ? "\n\n" : "";
    update.special_message = `${existing}${separator}[Pronunciation: ${body.pronunciation_hints}]`;
  }

  const { error } = await supabase.from("orders").update(update).eq("id", order.id);
  if (error) return json({ error: error.message }, 500);

  const details: Record<string, unknown> = { action: "regenerate_song" };
  if (body.lyrics_override) details.lyrics_override = true;
  if (body.pronunciation_hints) details.pronunciation_hints = body.pronunciation_hints;

  await logActivity(supabase, "order", order.id, "regenerate_song", "system", `CS agent triggered regeneration`, details);

  return json({ success: true, order_id: order.id, action: "regenerate_song" });
}

// ── update_lyrics ──
async function updateLyrics(
  supabase: ReturnType<typeof createClient>,
  body: { order_id?: string; new_lyrics?: string }
) {
  if (!body.order_id) return json({ error: "order_id required" }, 400);
  if (!body.new_lyrics) return json({ error: "new_lyrics required" }, 400);

  const order = await findOrder(supabase, body.order_id);
  if (!order) return json({ error: "order_not_found" }, 404);

  const { error } = await supabase
    .from("orders")
    .update({ automation_lyrics: body.new_lyrics })
    .eq("id", order.id);

  if (error) return json({ error: error.message }, 500);

  await logActivity(supabase, "order", order.id, "update_lyrics", "system", `CS agent updated lyrics`, { action: "update_lyrics" });

  return json({ success: true, order_id: order.id, action: "update_lyrics" });
}

// ── resend_delivery ──
async function resendDelivery(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string, supabaseServiceKey: string,
  body: { order_id?: string }
) {
  if (!body.order_id) return json({ error: "order_id required" }, 400);

  const order = await findOrder(supabase, body.order_id);
  if (!order) return json({ error: "order_not_found" }, 404);

  if (!order.song_url) {
    return json({ error: "Order has no song_url — cannot resend delivery" }, 422);
  }

  // Call send-song-delivery internally
  const deliveryPayload = {
    orderId: order.id,
    customerEmail: order.customer_email_override || order.customer_email,
    customerName: order.customer_name,
    recipientName: order.recipient_name,
    occasion: order.occasion,
    songUrl: order.song_url,
    ccEmail: order.customer_email_cc,
    revisionToken: order.revision_token,
    phoneE164: order.phone_e164,
    smsOptIn: order.sms_opt_in,
    timezone: order.timezone,
    smsStatus: order.sms_status,
  };

  const res = await fetch(`${supabaseUrl}/functions/v1/send-song-delivery`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify(deliveryPayload),
  });

  const result = await res.json();
  if (!res.ok) return json({ error: result.error || "delivery_failed" }, 500);

  await logActivity(supabase, "order", order.id, "resend_delivery", "system", `CS agent triggered delivery resend`, { action: "resend_delivery" });

  return json({ success: true, order_id: order.id, action: "resend_delivery" });
}

// ── send_preview_link ──
async function sendPreviewLink(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string, supabaseServiceKey: string,
  body: { email?: string }
) {
  const email = body.email?.trim()?.toLowerCase();
  if (!email) return json({ error: "email required" }, 400);

  // Find most recent lead for this email
  const { data: lead } = await supabase
    .from("leads")
    .select("id, preview_token, preview_song_url")
    .ilike("email", email)
    .not("preview_token", "is", null)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lead) return json({ error: "no_lead_found" }, 404);

  if (!lead.preview_song_url) {
    return json({ error: "Lead has no preview song uploaded yet" }, 422);
  }

  // Get admin password for send-lead-preview
  const adminPassword = Deno.env.get("ADMIN_PASSWORD");
  if (!adminPassword) return json({ error: "ADMIN_PASSWORD not configured" }, 500);

  const res = await fetch(`${supabaseUrl}/functions/v1/send-lead-preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify({ leadId: lead.id, adminPassword, resend: true }),
  });

  const result = await res.json();
  if (!res.ok) return json({ error: result.error || "preview_send_failed" }, 500);

  await logActivity(supabase, "lead", lead.id, "send_preview_link", "system", `CS agent triggered preview resend`, { action: "send_preview_link", email });

  return json({ success: true, lead_id: lead.id, action: "send_preview_link" });
}
