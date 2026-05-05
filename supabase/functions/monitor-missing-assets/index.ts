import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { isConvertedOrderMissingAssets } from "../_shared/lead-conversion.ts";
import { logActivity } from "../_shared/activity-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-monitor-key",
};

const ALERT_TO = "support@personalsonggifts.com";
const ALERT_FROM = "support@personalsonggifts.com";

/**
 * Sweeps converted orders for missing song_url or automation_lyrics and
 * fires a single alert email listing every offender. Re-flagging the same
 * order is suppressed for 6h via a marker in `order_activity_log` so we
 * don't spam during an outage.
 *
 * Trigger: pg_cron every 15 minutes, or POST manually with x-monitor-key.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: monitor key OR service-role bearer
  const monitorKey = req.headers.get("x-monitor-key");
  const expected = Deno.env.get("MONITOR_API_KEY");
  const auth = req.headers.get("authorization") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const isAuthed =
    (expected && monitorKey === expected) ||
    auth === `Bearer ${serviceKey}`;
  if (!isAuthed) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  // Look back 7 days; orders past that are already escalated by humans.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, status, song_url, automation_lyrics, customer_email, recipient_name, created_at, notes")
    .in("status", ["paid", "delivered", "ready"])
    .gte("created_at", sevenDaysAgo)
    .or("song_url.is.null,automation_lyrics.is.null")
    .limit(500);

  if (error) {
    console.error("[MONITOR] query error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const flagged = (orders || []).filter(isConvertedOrderMissingAssets);

  // ===== ALSO flag stranded direct orders =====
  // Bug pattern: a paid order with NO automation_status set 30+ minutes after
  // checkout, while an unconverted lead with a fully generated song exists for
  // the same email captured in the prior 24h. That's the inputs_hash-mismatch
  // signature — webhook didn't link them so automation never ran and the
  // customer never got the lead song they paid for.
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: strandedOrders } = await supabase
    .from("orders")
    .select("id, status, song_url, automation_status, customer_email, recipient_name, created_at, notes")
    .in("status", ["paid"])
    .is("automation_status", null)
    .is("song_url", null)
    .gte("created_at", sevenDaysAgo)
    .lte("created_at", thirtyMinAgo)
    .limit(200);

  const strandedToFlag: Array<typeof flagged[number]> = [];
  for (const o of strandedOrders || []) {
    if (!o.customer_email) continue;
    const { data: leadCandidates } = await supabase
      .from("leads")
      .select("id")
      .ilike("email", o.customer_email.toLowerCase())
      .neq("status", "converted")
      .not("full_song_url", "is", null)
      .gte("captured_at", oneDayAgo)
      .limit(3);
    if ((leadCandidates || []).length > 0) {
      strandedToFlag.push({ ...o, automation_lyrics: null } as any);
    }
  }

  // De-dup with primary flagged set
  const allFlagged = [...flagged];
  for (const s of strandedToFlag) {
    if (!allFlagged.find((f) => f.id === s.id)) allFlagged.push(s);
  }

  if (allFlagged.length === 0) {
    return new Response(JSON.stringify({ ok: true, flagged: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Suppress re-alerts within 6h: skip orders already flagged recently.
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: recentAlerts } = await supabase
    .from("order_activity_log")
    .select("entity_id")
    .eq("event_type", "missing_assets_alerted")
    .gte("created_at", sixHoursAgo);
  const alertedSet = new Set((recentAlerts || []).map((r) => r.entity_id));
  const newOnes = allFlagged.filter((o) => !alertedSet.has(o.id));

  if (newOnes.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, flagged: allFlagged.length, new: 0, note: "all suppressed" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Try to map each order back to its source lead via the notes column.
  const rows = newOnes.map((o) => {
    const m = o.notes?.match(/lead_session:(cs_\w+)/) || o.notes?.match(/stripe_session:(cs_\w+)/);
    const sessionTag = m ? m[0] : "(no session tag)";
    const missing = [
      !o.song_url ? "song_url" : null,
      !o.automation_lyrics ? "automation_lyrics" : null,
    ].filter(Boolean).join(", ");
    return { ...o, sessionTag, missing };
  });

  // Build alert email.
  const subject = `[ALERT] ${rows.length} converted order(s) missing assets`;
  const html = `
    <p><strong>${rows.length} converted order(s)</strong> have status paid/delivered/ready but are missing <code>song_url</code> and/or <code>automation_lyrics</code>. Customers will not receive their song.</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <tr><th>Order ID</th><th>Status</th><th>Missing</th><th>Customer</th><th>Recipient</th><th>Created</th><th>Session</th></tr>
      ${rows.map((r) => `
        <tr>
          <td><code>${r.id.slice(0, 8)}</code></td>
          <td>${r.status}</td>
          <td style="color:#b00">${r.missing}</td>
          <td>${r.customer_email || ""}</td>
          <td>${r.recipient_name || ""}</td>
          <td>${r.created_at}</td>
          <td><code>${r.sessionTag}</code></td>
        </tr>`).join("")}
    </table>
    <p>Triage: open Admin → Needs Attention. Use the existing <em>Regenerate</em> flow or copy from the matching lead.</p>
  `;
  const text = `${rows.length} converted orders missing assets:\n\n` +
    rows.map((r) => `- ${r.id.slice(0, 8)} [${r.status}] missing ${r.missing} | ${r.customer_email} | ${r.sessionTag}`).join("\n");

  const brevoApiKey = Deno.env.get("BREVO_API_KEY");
  let emailSent = false;
  let emailError: string | null = null;

  if (brevoApiKey) {
    try {
      const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json", "api-key": brevoApiKey },
        body: JSON.stringify({
          sender: { name: "Personal Song Gifts Monitor", email: ALERT_FROM },
          to: [{ email: ALERT_TO }],
          subject,
          htmlContent: html,
          textContent: text,
          headers: { "Precedence": "transactional" },
        }),
      });
      if (resp.ok) {
        emailSent = true;
      } else {
        emailError = `Brevo ${resp.status}: ${(await resp.text()).slice(0, 200)}`;
      }
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
    }
  } else {
    emailError = "BREVO_API_KEY not configured";
  }

  // Record per-order alert markers so we don't re-fire for 6h.
  for (const r of newOnes) {
    await logActivity(
      supabase,
      "order",
      r.id,
      "missing_assets_alerted",
      "system",
      `Flagged: missing ${rows.find((x) => x.id === r.id)?.missing}`,
      { emailSent, emailError },
    );
  }

  console.log(`[MONITOR] Flagged ${newOnes.length} new orders, emailSent=${emailSent}`);

  return new Response(
    JSON.stringify({
      ok: true,
      flagged: allFlagged.length,
      new: newOnes.length,
      emailSent,
      emailError,
      orderIds: newOnes.map((o) => o.id),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});