import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

const DEFAULT_SETTINGS = {
  paused: true,
  batch_size: 500,
  canary_size: 100,
  canary_sent: false,
  total_sent: 0,
  activated_at: null as string | null,
  last_run_at: null as string | null,
};

interface CampaignSettings {
  paused: boolean;
  batch_size: number;
  canary_size: number;
  canary_sent: boolean;
  total_sent: number;
  activated_at: string | null;
  last_run_at: string | null;
}

const SITE_URL = "https://personalsonggifts.com";
const PROMO_SLUG = "flash20";
const SETTINGS_KEY = "flash20_remarketing";

async function getCampaignSettings(supabase: ReturnType<typeof createClient>): Promise<CampaignSettings> {
  const { data } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (!data?.value) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(data.value as string);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function updateCampaignSettings(supabase: ReturnType<typeof createClient>, updates: Partial<CampaignSettings>) {
  const current = await getCampaignSettings(supabase);
  const merged = { ...current, ...updates };
  await supabase.from("admin_settings").upsert({
    key: SETTINGS_KEY,
    value: JSON.stringify(merged),
    updated_at: new Date().toISOString(),
  });
  return merged;
}

async function isPaused(supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const s = await getCampaignSettings(supabase);
  return s.paused;
}

async function ensurePromoActivated(supabase: ReturnType<typeof createClient>) {
  const settings = await getCampaignSettings(supabase);
  if (settings.activated_at) return settings.activated_at;

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 72 * 60 * 60 * 1000);

  await supabase
    .from("promotions")
    .update({
      is_active: true,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
    })
    .eq("slug", PROMO_SLUG);

  await updateCampaignSettings(supabase, { activated_at: startsAt.toISOString() });
  console.log(`[FLASH20] Promo activated. Window: ${startsAt.toISOString()} → ${endsAt.toISOString()}`);
  return startsAt.toISOString();
}

function buildSubject(recipientName: string | null | undefined): string {
  const name = (recipientName || "").trim();
  if (!name) return `Your song — $19.99 for 72 hours`;
  return `${name}'s song — $19.99 for 72 hours`;
}

function buildEmail(
  customerName: string,
  recipientName: string | null | undefined,
  previewToken: string,
  email: string,
) {
  const firstName = (customerName || "").split(" ")[0] || "there";
  const safeRecipient = (recipientName || "").trim() || "your loved one";
  const ctaUrl = `${SITE_URL}/preview/${previewToken}?promo=flash20`;
  const unsubscribeUrl = `${SITE_URL}/unsubscribe?email=${encodeURIComponent(email)}`;

  const textContent = `Hi ${firstName},

A while back you listened to ${safeRecipient}'s personalized song — but never picked up the full version.

For the next 72 hours only, you can unlock the full studio song for $19.99 (normally $99.99).

${ctaUrl}

The full song is 3–6 minutes long, mastered, and ready to share. Once the 72 hours are up, the price goes back to $99.99.

If you have any questions just reply to this email — a real person will get back to you.

— The Personal Song Gifts team

---
Personal Song Gifts
2108 N ST STE N, SACRAMENTO, CA 95816

To unsubscribe: ${unsubscribeUrl}`;

  const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">Hi ${firstName},</p>

    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
      A while back you listened to ${safeRecipient}'s personalized song — but never picked up the full version.
    </p>

    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
      For the next <strong>72 hours only</strong>, you can unlock the full studio song for <strong>$19.99</strong> (normally $99.99).
    </p>

    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 24px 0;">
      <a href="${ctaUrl}" style="color:#1E3A5F;">${ctaUrl}</a>
    </p>

    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
      The full song is 3–6 minutes long, mastered, and ready to share. Once the 72 hours are up, the price goes back to $99.99.
    </p>

    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
      If you have any questions just reply to this email — a real person will get back to you.
    </p>

    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 40px 0;">
      — The Personal Song Gifts team
    </p>

    <hr style="border:none;border-top:1px solid #eee;margin:0 0 20px 0;">
    <p style="color:#999;font-size:12px;margin:0 0 6px 0;">
      Personal Song Gifts &bull; 2108 N ST STE N, SACRAMENTO, CA 95816
    </p>
    <p style="color:#999;font-size:12px;margin:0;">
      <a href="${unsubscribeUrl}" style="color:#999;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;

  return { subject: buildSubject(recipientName), htmlContent, textContent, ctaUrl };
}

async function sendOneEmail(
  brevoApiKey: string,
  toEmail: string,
  customerName: string,
  recipientName: string | null | undefined,
  previewToken: string,
  leadId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { subject, htmlContent, textContent } = buildEmail(customerName, recipientName, previewToken, toEmail);
  const messageId = `<${leadId}.flash20.${Date.now()}@personalsonggifts.com>`;
  const senderEmail = "support@personalsonggifts.com";
  const senderName = "Personal Song Gifts";
  const unsubscribeUrl = `${SITE_URL}/unsubscribe?email=${encodeURIComponent(toEmail)}`;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": brevoApiKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      replyTo: { email: senderEmail, name: senderName },
      to: [{ email: toEmail, name: customerName || toEmail }],
      subject,
      htmlContent,
      textContent,
      headers: {
        "Message-ID": messageId,
        "X-Entity-Ref-ID": leadId,
        "Precedence": "transactional",
        "List-Unsubscribe": `<mailto:${senderEmail}?subject=unsubscribe>, <${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, error: `Brevo ${res.status}: ${errText.slice(0, 200)}` };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    const provided = req.headers.get("x-admin-password");
    if (!adminPassword || provided !== adminPassword) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const { dryRun, testEmails, send } = body;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const brevoApiKey = Deno.env.get("BREVO_API_KEY") || "";

    // Hard-fail fast if Brevo key missing for any send-mode call (test or production batch)
    if ((body.send || (body.testEmails && Array.isArray(body.testEmails) && body.testEmails.length > 0)) && !brevoApiKey) {
      console.error("[FLASH20] BREVO_API_KEY env var is missing or empty — aborting send.");
      return new Response(JSON.stringify({ error: "BREVO_API_KEY not configured on the edge function environment." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Base eligibility filter (5+ days old, US tz, preview sent + token, not converted/dismissed,
    // not already sent flash20 in last 30d). Suppression + paid-customer filters happen post-fetch.
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const baseQuery = () =>
      supabase
        .from("leads")
        .select("id, email, customer_name, recipient_name, preview_token, last_promo_email_sent_at, timezone", { count: "exact" })
        .not("preview_sent_at", "is", null)
        .not("preview_song_url", "is", null)
        .not("preview_token", "is", null)
        .neq("status", "converted")
        .is("dismissed_at", null)
        .lt("captured_at", fiveDaysAgo)
        .like("timezone", "America/%")
        .or(`last_promo_email_sent_at.is.null,last_promo_email_sent_at.lt.${thirtyDaysAgo}`);

    // ---- DRY RUN ----
    if (dryRun) {
      const { data: sample, count } = await baseQuery().limit(10);
      const { count: suppressedCount } = await supabase
        .from("email_suppressions").select("email", { count: "exact", head: true });
      const settings = await getCampaignSettings(supabase);
      return new Response(JSON.stringify({
        dryRun: true,
        totalEligible: count || 0,
        suppressedEmails: suppressedCount || 0,
        settings,
        sample: (sample || []).map(l => ({
          email: l.email, customer_name: l.customer_name, recipient_name: l.recipient_name,
          timezone: l.timezone, has_token: !!l.preview_token,
        })),
        note: "Suppressed emails and existing customers will be excluded at send time.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- TEST MODE ----
    if (testEmails && Array.isArray(testEmails) && testEmails.length > 0) {
      // Activate promo if not yet activated (so test links use $19.99)
      await ensurePromoActivated(supabase);

      const results: { email: string; sent: boolean; error?: string }[] = [];
      for (const email of testEmails) {
        const { data: lead } = await supabase
          .from("leads")
          .select("id, email, customer_name, recipient_name, preview_token")
          .eq("email", email)
          .not("preview_token", "is", null)
          .order("captured_at", { ascending: false })
          .limit(1).maybeSingle();

        let testToken = lead?.preview_token;
        let testCustomer = lead?.customer_name || "Test User";
        let testRecipient: string | null | undefined = lead?.recipient_name || "Sample";

        if (!testToken) {
          const { data: anyLead } = await supabase
            .from("leads")
            .select("preview_token, customer_name, recipient_name")
            .not("preview_token", "is", null)
            .not("preview_song_url", "is", null)
            .limit(1).maybeSingle();
          testToken = anyLead?.preview_token || "test-token";
          if (anyLead) testRecipient = anyLead.recipient_name;
        }

        const r = await sendOneEmail(brevoApiKey, email, testCustomer, testRecipient, testToken!, lead?.id || "test");
        results.push({ email, sent: r.ok, error: r.error });
      }

      return new Response(JSON.stringify({
        testMode: true, results,
        totalSent: results.filter(r => r.sent).length,
        totalFailed: results.filter(r => !r.sent).length,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- PRODUCTION SEND ----
    if (send) {
      const settings = await getCampaignSettings(supabase);
      if (settings.paused) {
        return new Response(JSON.stringify({ paused: true, message: "Campaign is paused. Resume from admin panel." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Activate promo on first send (sets ends_at = now + 72h)
      await ensurePromoActivated(supabase);

      // Determine batch size (canary or normal), hard-cap at 1000
      const targetBatchSize = Math.min(1000, settings.canary_sent ? settings.batch_size : settings.canary_size);

      const { data: candidates, error: fetchErr } = await baseQuery().limit(targetBatchSize * 2);
      if (fetchErr) throw fetchErr;
      if (!candidates || candidates.length === 0) {
        return new Response(JSON.stringify({
          send: true, eligible: 0, sent: 0, failed: 0, remaining: 0, message: "No eligible leads remaining.",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const candidateEmails = candidates.map(c => c.email.toLowerCase());

      // Filter suppressed
      const { data: suppressed } = await supabase
        .from("email_suppressions").select("email").in("email", candidateEmails);
      const suppressedSet = new Set((suppressed || []).map(s => (s.email as string).toLowerCase()));

      // Filter existing customers (any non-cancelled order)
      const { data: paidOrders } = await supabase
        .from("orders").select("customer_email").in("customer_email", candidateEmails).neq("status", "cancelled");
      const paidSet = new Set((paidOrders || []).map(o => (o.customer_email as string).toLowerCase()));

      const eligible = candidates.filter(c => {
        const e = c.email.toLowerCase();
        return !suppressedSet.has(e) && !paidSet.has(e);
      }).slice(0, targetBatchSize);

      let totalSent = 0;
      let totalFailed = 0;
      const errors: { email: string; error: string }[] = [];
      let attemptCounter = 0;
      const skipped = { claim_failed: 0, missing_token: 0, send_threw: 0 };
      const CHUNK_SIZE = 50;

      for (let i = 0; i < eligible.length; i += CHUNK_SIZE) {
        if (i > 0) {
          if (await isPaused(supabase)) {
            await updateCampaignSettings(supabase, {
              total_sent: settings.total_sent + totalSent,
              last_run_at: new Date().toISOString(),
              canary_sent: true,
            });
            return new Response(JSON.stringify({
              send: true, pausedMidRun: true, attempted: i, sent: totalSent, failed: totalFailed,
              remaining: eligible.length - i, errors,
            }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          await new Promise(r => setTimeout(r, 500));
        }

        const chunk = eligible.slice(i, i + CHUNK_SIZE);
        for (const lead of chunk) {
          // Guard: skip leads with no preview token (shouldn't happen due to baseQuery filter, but be safe)
          if (!lead.preview_token) {
            skipped.missing_token++;
            console.log(`[FLASH20] Skipped lead ${lead.id}: missing preview_token`);
            continue;
          }

          // Atomic claim: only set last_promo_email_sent_at if still null OR > 30 days old
          const claimTime = new Date().toISOString();
          const { data: claimed, error: claimErr } = await supabase
            .from("leads")
            .update({ last_promo_email_sent_at: claimTime })
            .eq("id", lead.id)
            .or(`last_promo_email_sent_at.is.null,last_promo_email_sent_at.lt.${thirtyDaysAgo}`)
            .select("id").maybeSingle();

          if (claimErr || !claimed) {
            skipped.claim_failed++;
            console.log(`[FLASH20] Claim skipped for ${lead.id} (race or already sent)${claimErr ? ` err=${claimErr.message}` : ""}`);
            continue;
          }

          attemptCounter++;
          let r: { ok: boolean; error?: string };
          try {
            r = await sendOneEmail(brevoApiKey, lead.email, lead.customer_name, lead.recipient_name, lead.preview_token!, lead.id);
          } catch (sendErr) {
            skipped.send_threw++;
            const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
            console.error(`[FLASH20] sendOneEmail threw for ${lead.email}: ${msg}`);
            await supabase.from("leads").update({ last_promo_email_sent_at: null }).eq("id", lead.id);
            totalFailed++;
            errors.push({ email: lead.email, error: `threw: ${msg}` });
            continue;
          }
          if (r.ok) {
            totalSent++;
            // Activity log
            await supabase.from("order_activity_log").insert({
              entity_type: "lead", entity_id: lead.id,
              event_type: "flash20_sent", actor: "system",
              details: `Flash $19.99 (72h) remarketing email sent to ${lead.email}`,
            });
          } else {
            // Roll back the claim so it can be retried
            await supabase.from("leads").update({ last_promo_email_sent_at: null }).eq("id", lead.id);
            totalFailed++;
            errors.push({ email: lead.email, error: r.error || "unknown" });
          }
        }
      }

      await updateCampaignSettings(supabase, {
        total_sent: settings.total_sent + totalSent,
        last_run_at: new Date().toISOString(),
        canary_sent: true,
      });

      // Count remaining
      const { count: remainingCount } = await baseQuery().limit(1);

      return new Response(JSON.stringify({
        send: true,
        eligible: eligible.length,
        attempted: eligible.length,
        sent: totalSent,
        failed: totalFailed,
        remaining: remainingCount || 0,
        canaryBatch: !settings.canary_sent,
        errors: errors.slice(0, 20),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- STATS ----
    if (body.stats) {
      // Sent: leads where flash20_sent activity exists (or last_promo_email_sent_at >= activated_at)
      const settings = await getCampaignSettings(supabase);
      const { count: sentCount } = await supabase
        .from("order_activity_log")
        .select("id", { count: "exact", head: true })
        .eq("entity_type", "lead").eq("event_type", "flash20_sent");

      // Conversions: among those sent, how many have converted_at after the email
      let conversions = 0;
      let revenueCents = 0;
      if (settings.activated_at) {
        const { data: convertedLeads } = await supabase
          .from("leads")
          .select("id, order_id, converted_at")
          .not("last_promo_email_sent_at", "is", null)
          .gte("last_promo_email_sent_at", settings.activated_at)
          .not("converted_at", "is", null)
          .not("order_id", "is", null);
        conversions = (convertedLeads || []).length;
        const orderIds = (convertedLeads || []).map(l => l.order_id).filter(Boolean) as string[];
        if (orderIds.length > 0) {
          const { data: orders } = await supabase
            .from("orders").select("price_cents, price").in("id", orderIds);
          revenueCents = (orders || []).reduce((sum, o: any) => sum + (o.price_cents ?? (o.price ? o.price * 100 : 0)), 0);
        }
      }

      // Promo expiry
      const { data: promoRow } = await supabase
        .from("promotions").select("ends_at, is_active, starts_at").eq("slug", PROMO_SLUG).maybeSingle();

      return new Response(JSON.stringify({
        stats: true,
        sent: sentCount || 0,
        conversions,
        revenueCents,
        promo: promoRow,
        activated_at: settings.activated_at,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- RESET ----
    if (body.reset) {
      await updateCampaignSettings(supabase, {
        ...DEFAULT_SETTINGS,
        paused: true,
      });
      return new Response(JSON.stringify({ reset: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Provide dryRun, testEmails, send, stats, or reset" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[FLASH20] error:", error);
    const msg = error instanceof Error ? error.message : "Server error";
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
