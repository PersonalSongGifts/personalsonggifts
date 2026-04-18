// Sends "your bonus track is ready" email to past customers whose bonus
// track was generated but never played or unlocked.
//
// Eligibility (paid orders only):
//   - status = 'delivered' AND delivery_status = 'sent'
//   - bonus_song_url IS NOT NULL (bonus actually generated)
//   - bonus_first_played_at IS NULL
//   - bonus_unlocked_at IS NULL
//   - bonus_email_sent_at IS NULL (never emailed before)
//   - dismissed_at IS NULL
//   - sent_at older than 2 days (give them time to discover organically)
//
// Modes (POST body):
//   { mode: "stats" }                 → returns counts only, no sends
//   { mode: "dryRun", limit: N }      → returns the list that WOULD be sent
//   { mode: "test", testEmails: [..]} → sends to override addresses (1 sample order)
//   { mode: "send", limit: N }        → actually sends to N eligible customers

import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

const SITE_URL = "https://www.personalsonggifts.com";
const FROM_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") || "support@personalsonggifts.com";
const FROM_NAME = Deno.env.get("BREVO_SENDER_NAME") || "Personal Song Gifts";
const SETTING_KEY = "bonus_track_email_enabled";

interface EligibleOrder {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_email_override: string | null;
  recipient_name: string;
  bonus_song_title: string | null;
}

function shortId(id: string) {
  return id.substring(0, 8).toUpperCase();
}

function buildEmail(order: EligibleOrder): { subject: string; html: string; text: string } {
  const firstName = (order.customer_name || "").split(" ")[0] || "there";
  const songLink = `${SITE_URL}/song/${order.id.substring(0, 8)}`;
  const subject = `A second version of ${order.recipient_name}'s song`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#222;font-size:15px;line-height:1.6;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
<p>Hi ${firstName},</p>

<p>Quick note — when we made ${order.recipient_name}'s song, our team also produced a second version in a different style (acoustic / R&amp;B feel) as a little bonus.</p>

<p>It's sitting on your song page, ready to listen to:</p>

<p><a href="${songLink}" style="color:#1a73e8;">${songLink}</a></p>

<p>Have a listen and see which version you and ${order.recipient_name} like more. Some people end up preferring the bonus.</p>

<p>If you'd rather not hear from us about this, just reply with "no thanks" and we'll stop.</p>

<p>— Mike<br>Personal Song Gifts</p>
</div></body></html>`;

  const text = `Hi ${firstName},

Quick note — when we made ${order.recipient_name}'s song, our team also produced a second version in a different style (acoustic / R&B feel) as a little bonus.

It's sitting on your song page, ready to listen to:

${songLink}

Have a listen and see which version you and ${order.recipient_name} like more. Some people end up preferring the bonus.

If you'd rather not hear from us about this, just reply with "no thanks" and we'll stop.

— Mike
Personal Song Gifts`;

  return { subject, html, text };
}

async function sendViaBrevo(toEmail: string, toName: string, subject: string, html: string, text: string) {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) throw new Error("BREVO_API_KEY not set");

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email: toEmail, name: toName || toEmail }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Brevo ${res.status}: ${errBody}`);
  }
  return await res.json();
}

async function getEnabled(supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const { data } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", SETTING_KEY)
    .maybeSingle();
  // Default OFF — admin must explicitly turn on.
  return data?.value === "true";
}

async function setEnabled(supabase: ReturnType<typeof createClient>, value: boolean) {
  await supabase.from("admin_settings").upsert({
    key: SETTING_KEY,
    value: value ? "true" : "false",
    updated_at: new Date().toISOString(),
  });
}

async function fetchEligible(supabase: ReturnType<typeof createClient>, limit: number): Promise<EligibleOrder[]> {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("orders")
    .select("id, customer_name, customer_email, customer_email_override, recipient_name, bonus_song_title, sent_at, status, delivery_status, bonus_song_url, bonus_first_played_at, bonus_unlocked_at, bonus_email_sent_at, dismissed_at")
    .eq("status", "delivered")
    .eq("delivery_status", "sent")
    .not("bonus_song_url", "is", null)
    .is("bonus_first_played_at", null)
    .is("bonus_unlocked_at", null)
    .is("bonus_email_sent_at", null)
    .is("dismissed_at", null)
    .lt("sent_at", twoDaysAgo)
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as EligibleOrder[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth
    const adminPassword = req.headers.get("x-admin-password");
    if (adminPassword !== Deno.env.get("ADMIN_PASSWORD")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const mode: string = body.mode || "stats";

    // Toggle handler
    if (mode === "setEnabled") {
      await setEnabled(supabase, !!body.enabled);
      return new Response(JSON.stringify({ ok: true, enabled: !!body.enabled }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const enabled = await getEnabled(supabase);

    // Stats: counts for the panel
    if (mode === "stats") {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      const [eligibleRes, sentRes, playedRes, unlockedRes] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true })
          .eq("status", "delivered").eq("delivery_status", "sent")
          .not("bonus_song_url", "is", null)
          .is("bonus_first_played_at", null).is("bonus_unlocked_at", null)
          .is("bonus_email_sent_at", null).is("dismissed_at", null)
          .lt("sent_at", twoDaysAgo),
        supabase.from("orders").select("id", { count: "exact", head: true })
          .not("bonus_email_sent_at", "is", null),
        supabase.from("orders").select("id", { count: "exact", head: true })
          .not("bonus_email_sent_at", "is", null)
          .not("bonus_first_played_at", "is", null),
        supabase.from("orders").select("id", { count: "exact", head: true })
          .not("bonus_email_sent_at", "is", null)
          .not("bonus_unlocked_at", "is", null),
      ]);

      return new Response(JSON.stringify({
        enabled,
        eligible: eligibleRes.count || 0,
        sent: sentRes.count || 0,
        playedAfter: playedRes.count || 0,
        unlockedAfter: unlockedRes.count || 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Dry run: list of eligible (no sends)
    if (mode === "dryRun") {
      const limit = Math.min(Number(body.limit) || 10, 100);
      const eligible = await fetchEligible(supabase, limit);
      return new Response(JSON.stringify({
        enabled,
        count: eligible.length,
        sample: eligible.map(o => ({
          id: o.id,
          shortId: shortId(o.id),
          customer: o.customer_email,
          recipient: o.recipient_name,
        })),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Test mode: send sample to override addresses
    if (mode === "test") {
      const testEmails: string[] = Array.isArray(body.testEmails) ? body.testEmails.filter(Boolean) : [];
      if (testEmails.length === 0) {
        return new Response(JSON.stringify({ error: "testEmails required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const sample = await fetchEligible(supabase, 1);
      const order = sample[0] || {
        id: "00000000-0000-0000-0000-000000000000",
        customer_name: "Sample Customer",
        customer_email: testEmails[0],
        customer_email_override: null,
        recipient_name: "Sarah",
        bonus_song_title: null,
      } as EligibleOrder;

      const { subject, html, text } = buildEmail(order);
      const results: Array<{ email: string; ok: boolean; error?: string }> = [];
      for (const email of testEmails) {
        try {
          await sendViaBrevo(email, "Test", `[TEST] ${subject}`, html, text);
          results.push({ email, ok: true });
        } catch (e) {
          results.push({ email, ok: false, error: String(e) });
        }
      }
      return new Response(JSON.stringify({ ok: true, results, usedOrder: shortId(order.id) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send mode: actual batch
    if (mode === "send") {
      if (!enabled) {
        return new Response(JSON.stringify({ error: "Bonus track emails are paused. Enable the toggle first." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const limit = Math.min(Number(body.limit) || 25, 200);
      const eligible = await fetchEligible(supabase, limit);

      let success = 0;
      let failed = 0;
      const errors: Array<{ id: string; error: string }> = [];

      for (const order of eligible) {
        const recipient = order.customer_email_override || order.customer_email;
        if (!recipient) {
          failed++;
          errors.push({ id: shortId(order.id), error: "no email" });
          continue;
        }

        // Check suppression
        const { data: suppressed } = await supabase
          .from("email_suppressions")
          .select("email")
          .eq("email", recipient.toLowerCase())
          .maybeSingle();
        if (suppressed) {
          // Mark as sent so we don't keep trying
          await supabase.from("orders").update({ bonus_email_sent_at: new Date().toISOString() }).eq("id", order.id);
          continue;
        }

        const { subject, html, text } = buildEmail(order);
        try {
          await sendViaBrevo(recipient, order.customer_name, subject, html, text);
          await supabase.from("orders").update({ bonus_email_sent_at: new Date().toISOString() }).eq("id", order.id);
          // Activity log (best effort)
          await supabase.from("order_activity_log").insert({
            entity_id: order.id,
            entity_type: "order",
            event_type: "bonus_track_email_sent",
            actor: "system",
            details: `Bonus track notification sent to ${recipient}`,
          }).then(() => {}, () => {});
          success++;
          // small delay to avoid hammering Brevo
          await new Promise(r => setTimeout(r, 150));
        } catch (e) {
          failed++;
          errors.push({ id: shortId(order.id), error: String(e).substring(0, 200) });
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        attempted: eligible.length,
        success,
        failed,
        errors: errors.slice(0, 10),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "unknown mode" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-bonus-track-email error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
