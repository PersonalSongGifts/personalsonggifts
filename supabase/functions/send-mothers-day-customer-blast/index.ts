import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

const SITE_URL = "https://www.personalsonggifts.com";
const SETTINGS_KEY = "mothers_day_customer_blast";
const PROMO_CODE = "MOM5";
const ORIGINAL_PRICE_LABEL = "$29.99";
const DISCOUNTED_PRICE_LABEL = "$24.99";
const MOTHERS_DAY_DATE_LABEL = "May 10";

// Local-time send window (inclusive start, exclusive end). 10:00 local only.
// Cron runs hourly; each recipient gets emailed in the hour their local time hits 10:00.
const SEND_WINDOW_START_HOUR = 10;
const SEND_WINDOW_END_HOUR = 11;

// US fallback for NULL timezone customers (most data is US-heavy)
const FALLBACK_TIMEZONE = "America/New_York";

// International tz prefixes (everything not in this set is treated as US-fallback)
const INTERNATIONAL_TZ_PREFIXES = ["Europe/", "Asia/", "Africa/", "Australia/", "Pacific/", "Atlantic/", "Indian/", "Antarctica/"];

interface CampaignSettings {
  paused: boolean;
  batch_size: number;
  total_sent: number;
  last_run_at: string | null;
  activated_at: string | null;
  canary_sent: boolean;
}

const DEFAULT_SETTINGS: CampaignSettings = {
  paused: true,
  batch_size: 250,
  total_sent: 0,
  last_run_at: null,
  activated_at: null,
  canary_sent: false,
};

function getLocalHour(timezone: string | null | undefined): number {
  const tz = timezone && timezone.length > 0 ? timezone : FALLBACK_TIMEZONE;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false });
    const parts = fmt.formatToParts(new Date());
    const hourPart = parts.find(p => p.type === "hour")?.value ?? "0";
    let h = parseInt(hourPart, 10);
    if (h === 24) h = 0;
    return h;
  } catch {
    return -1;
  }
}

function isInSendWindow(timezone: string | null | undefined): boolean {
  const h = getLocalHour(timezone);
  return h >= SEND_WINDOW_START_HOUR && h < SEND_WINDOW_END_HOUR;
}

function isInternational(tz: string | null | undefined): boolean {
  if (!tz) return false;
  return INTERNATIONAL_TZ_PREFIXES.some(p => tz.startsWith(p));
}

async function getCampaignSettings(supabase: ReturnType<typeof createClient>): Promise<CampaignSettings> {
  const { data } = await supabase.from("admin_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
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

interface EmailParams {
  customerName: string;
  email: string;
}

function buildEmail(p: EmailParams) {
  const toTitleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
  const rawFirst = (p.customerName || "").trim().split(/\s+/)[0] || "";
  const firstName = rawFirst ? toTitleCase(rawFirst) : "there";
  const ctaUrl = `${SITE_URL}/create?occasion=mothers-day`;
  const unsubscribeUrl = `${SITE_URL}/unsubscribe?email=${encodeURIComponent(p.email)}`;

  const subject = "Thinking of you for Mother's Day";

  const textContent = `Hi ${firstName},

Mother's Day is coming up on ${MOTHERS_DAY_DATE_LABEL}, and I wanted to reach out personally because you've made a song with us before.

If there's a mom in your life — your own mom, your wife, your daughter, your grandma — a song made just for her can mean more than almost any gift you can wrap.

I wanted to make this easy for you. Our pricing is currently at our lowest in a while, ${ORIGINAL_PRICE_LABEL}, and as a thank-you for being a past customer, here's $5 off with code ${PROMO_CODE}, bringing it to ${DISCOUNTED_PRICE_LABEL}.

We're planning to raise prices ahead of Mother's Day, so if this is something you've been thinking about, now is the moment.

Start a song: ${ctaUrl}

Thanks for being part of this,
The Personal Song Gifts team

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
      Mother's Day is coming up on ${MOTHERS_DAY_DATE_LABEL}, and I wanted to reach out personally because you've made a song with us before.
    </p>

    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
      If there's a mom in your life — your own mom, your wife, your daughter, your grandma — a song made just for her can mean more than almost any gift you can wrap.
    </p>

    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
      I wanted to make this easy for you. Our pricing is currently at our lowest in a while, ${ORIGINAL_PRICE_LABEL}, and as a thank-you for being a past customer, here's $5 off with code <strong>${PROMO_CODE}</strong>, bringing it to ${DISCOUNTED_PRICE_LABEL}.
    </p>

    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 24px 0;">
      We're planning to raise prices ahead of Mother's Day, so if this is something you've been thinking about, now is the moment.
    </p>

    <p style="margin:0 0 28px 0;">
      <a href="${ctaUrl}" style="color:#1E3A5F;font-size:16px;">${ctaUrl}</a>
    </p>

    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 8px 0;">Thanks for being part of this,</p>
    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 40px 0;">The Personal Song Gifts team</p>

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

  return { subject, htmlContent, textContent };
}

async function sendOneEmail(brevoApiKey: string, params: EmailParams, dedupeRef: string) {
  const { subject, htmlContent, textContent } = buildEmail(params);
  const messageId = `<md-blast.${dedupeRef}.${Date.now()}@personalsonggifts.com>`;
  const senderEmail = "support@personalsonggifts.com";
  const senderName = "Personal Song Gifts";
  const unsubscribeUrl = `${SITE_URL}/unsubscribe?email=${encodeURIComponent(params.email)}`;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": brevoApiKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      replyTo: { email: senderEmail, name: senderName },
      to: [{ email: params.email, name: params.customerName || params.email }],
      subject,
      htmlContent,
      textContent,
      headers: {
        "Message-ID": messageId,
        "X-Entity-Ref-ID": dedupeRef,
        "List-Unsubscribe": `<mailto:${senderEmail}?subject=unsubscribe>, <${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, error: `Brevo ${res.status}: ${errText.slice(0, 200)}` };
  }
  return { ok: true, subject };
}

interface CandidateRow {
  email: string;
  customer_name: string | null;
  timezone: string | null;
  latest_order_id: string;
}

/**
 * Returns deduplicated past customers eligible for the MD blast.
 * Excludes:
 *  - anyone who's already received this blast (last_mothers_day_blast_sent_at IS NOT NULL on any of their orders)
 *  - anyone who's already purchased a Mother's Day song
 *  - anyone who bought in the last 30 days
 *  - anyone with an in-flight order (created in last 14d, status not delivered/refunded/canceled)
 *  - anyone in email_suppressions
 */
async function getEligibleCandidates(
  supabase: ReturnType<typeof createClient>,
  limit: number,
  segment: "us" | "intl" | "all",
): Promise<CandidateRow[]> {
  // Pull a generous batch and dedupe in-memory. We page through orders ordered by created_at desc
  // and keep the first-seen email. A few thousand candidates is well within memory budget.
  const PAGE = 1000;
  const seen = new Map<string, CandidateRow>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("orders")
      .select("customer_email, customer_name, timezone, id, created_at, last_mothers_day_blast_sent_at")
      .not("customer_email", "is", null)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Orders query: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data as Array<{ customer_email: string; customer_name: string | null; timezone: string | null; id: string; last_mothers_day_blast_sent_at: string | null }>) {
      const email = (row.customer_email || "").trim().toLowerCase();
      if (!email) continue;
      if (seen.has(email)) continue;
      seen.set(email, {
        email,
        customer_name: row.customer_name,
        timezone: row.timezone,
        latest_order_id: row.id,
      });
    }
    if (data.length < PAGE) break;
    from += PAGE;
    if (seen.size > 10000) break; // safety
  }

  const allEmails = [...seen.keys()];
  if (allEmails.length === 0) return [];

  // Build exclusion sets
  const exclude = new Set<string>();

  // 1. Already-blasted (any order with last_mothers_day_blast_sent_at not null)
  // 2. Already MD buyers (occasion ILIKE %mother%)
  // 3. Recent buyers (last 30 days, any order)
  // 4. In-flight (created last 14d, status not delivered/refunded/canceled)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const CHUNK = 500;
  for (let i = 0; i < allEmails.length; i += CHUNK) {
    const slice = allEmails.slice(i, i + CHUNK);

    // Already blasted
    {
      const { data } = await supabase
        .from("orders")
        .select("customer_email")
        .in("customer_email", slice)
        .not("last_mothers_day_blast_sent_at", "is", null);
      for (const r of (data || []) as Array<{ customer_email: string }>) {
        exclude.add((r.customer_email || "").trim().toLowerCase());
      }
    }

    // MD buyers
    {
      const { data } = await supabase
        .from("orders")
        .select("customer_email")
        .in("customer_email", slice)
        .ilike("occasion", "%mother%");
      for (const r of (data || []) as Array<{ customer_email: string }>) {
        exclude.add((r.customer_email || "").trim().toLowerCase());
      }
    }

    // Recent buyers (30d)
    {
      const { data } = await supabase
        .from("orders")
        .select("customer_email")
        .in("customer_email", slice)
        .gte("created_at", thirtyDaysAgo);
      for (const r of (data || []) as Array<{ customer_email: string }>) {
        exclude.add((r.customer_email || "").trim().toLowerCase());
      }
    }

    // In-flight (14d, undelivered)
    {
      const { data } = await supabase
        .from("orders")
        .select("customer_email, status")
        .in("customer_email", slice)
        .gte("created_at", fourteenDaysAgo)
        .not("status", "in", "(delivered,refunded,canceled)");
      for (const r of (data || []) as Array<{ customer_email: string }>) {
        exclude.add((r.customer_email || "").trim().toLowerCase());
      }
    }
  }

  // Suppressions
  for (let i = 0; i < allEmails.length; i += CHUNK) {
    const slice = allEmails.slice(i, i + CHUNK);
    const { data } = await supabase
      .from("email_suppressions")
      .select("email")
      .in("email", slice);
    for (const r of (data || []) as Array<{ email: string }>) {
      exclude.add((r.email || "").trim().toLowerCase());
    }
  }

  const filtered: CandidateRow[] = [];
  for (const [email, row] of seen) {
    if (exclude.has(email)) continue;
    if (segment === "us" && isInternational(row.timezone)) continue;
    if (segment === "intl" && !isInternational(row.timezone)) continue;
    filtered.push(row);
    if (filtered.length >= limit) break;
  }
  return filtered;
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
    const dryRun: boolean = !!body.dryRun;
    const send: boolean = !!body.send;
    const sendCanary: boolean = !!body.sendCanary;
    const testEmails: string[] = Array.isArray(body.testEmails) ? body.testEmails : [];
    const action: string | undefined = typeof body.action === "string" ? body.action : undefined;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const brevoApiKey = Deno.env.get("BREVO_API_KEY") || "";

    // ----- Action: pause / resume / reset-canary -----
    if (action === "pause") {
      const s = await updateCampaignSettings(supabase, { paused: true });
      return new Response(JSON.stringify({ ok: true, settings: s }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "resume") {
      const s = await updateCampaignSettings(supabase, { paused: false });
      return new Response(JSON.stringify({ ok: true, settings: s }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (action === "stats") {
      const settings = await getCampaignSettings(supabase);
      const { count: blastedCount } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .not("last_mothers_day_blast_sent_at", "is", null);
      // Get unique blasted emails count
      const { data: blastedRows } = await supabase
        .from("orders")
        .select("customer_email")
        .not("last_mothers_day_blast_sent_at", "is", null)
        .limit(10000);
      const uniqueBlasted = new Set((blastedRows || []).map(r => (r.customer_email || "").trim().toLowerCase())).size;
      return new Response(JSON.stringify({
        ok: true,
        settings,
        unique_recipients_emailed: uniqueBlasted,
        order_rows_marked: blastedCount || 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ----- Test send (skips eligibility, doesn't mark orders) -----
    if (testEmails.length > 0) {
      if (!brevoApiKey) {
        return new Response(JSON.stringify({ error: "BREVO_API_KEY not configured." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const results: Array<{ email: string; ok: boolean; error?: string }> = [];
      for (const email of testEmails) {
        const r = await sendOneEmail(brevoApiKey, { customerName: "Friend", email }, `test-${Date.now()}`);
        results.push({ email, ...r });
      }
      return new Response(JSON.stringify({ ok: true, mode: "test", results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ----- Dry run -----
    if (dryRun) {
      const segment = (body.segment === "intl" || body.segment === "us") ? body.segment : "all";
      const limit = typeof body.limit === "number" ? Math.max(1, Math.min(2000, body.limit)) : 2000;
      const candidates = await getEligibleCandidates(supabase, limit, segment);
      const inWindow = candidates.filter(c => isInSendWindow(c.timezone));
      return new Response(JSON.stringify({
        ok: true,
        mode: "dry_run",
        segment,
        total_eligible: candidates.length,
        in_send_window_now: inWindow.length,
        sample: candidates.slice(0, 10).map(c => ({
          email: c.email,
          tz: c.timezone,
          local_hour: getLocalHour(c.timezone),
          international: isInternational(c.timezone),
        })),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ----- Real send (canary or full) -----
    if (!send && !sendCanary) {
      return new Response(JSON.stringify({ error: "Specify dryRun, sendCanary, send, action, or testEmails." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!brevoApiKey) {
      return new Response(JSON.stringify({ error: "BREVO_API_KEY not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const settings = await getCampaignSettings(supabase);

    // Cron-driven sends respect the pause flag. Manual canary/send from admin can override via body.force.
    const force: boolean = !!body.force;
    if (settings.paused && !force && !sendCanary) {
      return new Response(JSON.stringify({ ok: true, mode: "skipped", reason: "campaign_paused" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const limit = sendCanary
      ? (typeof body.canarySize === "number" ? Math.max(1, Math.min(200, body.canarySize)) : 50)
      : Math.max(1, Math.min(1000, settings.batch_size));

    const segment = (body.segment === "intl" || body.segment === "us") ? body.segment : "all";
    const candidates = await getEligibleCandidates(supabase, 2000, segment);
    const ready = candidates.filter(c => isInSendWindow(c.timezone)).slice(0, limit);

    let sent = 0, failed = 0;
    const errors: Array<{ email: string; error: string }> = [];
    const sentEmails: string[] = [];

    for (const c of ready) {
      // Atomic claim: update only if last_mothers_day_blast_sent_at IS NULL (per email).
      // We mark every order row for this email so future eligibility queries exclude them.
      const nowIso = new Date().toISOString();
      const { data: claimed, error: claimErr } = await supabase
        .from("orders")
        .update({ last_mothers_day_blast_sent_at: nowIso })
        .eq("customer_email", c.email)
        .is("last_mothers_day_blast_sent_at", null)
        .select("id");
      if (claimErr) {
        failed++;
        errors.push({ email: c.email, error: `Claim failed: ${claimErr.message}` });
        continue;
      }
      if (!claimed || claimed.length === 0) {
        // Already claimed by a concurrent run, skip silently
        continue;
      }

      const r = await sendOneEmail(brevoApiKey, {
        customerName: c.customer_name || "",
        email: c.email,
      }, c.latest_order_id);

      if (r.ok) {
        sent++;
        sentEmails.push(c.email);
        // Activity log
        await supabase.from("order_activity_log").insert({
          entity_type: "order",
          entity_id: c.latest_order_id,
          event_type: "mothers_day_customer_blast_sent",
          actor: "system",
          details: `Sent to ${c.email} (tz=${c.timezone || "null"}, segment=${isInternational(c.timezone) ? "intl" : "us"})`,
          metadata: { email: c.email, timezone: c.timezone, subject: r.subject },
        });
      } else {
        failed++;
        errors.push({ email: c.email, error: r.error || "send failed" });
        // Roll back the claim so we can retry next cycle
        await supabase
          .from("orders")
          .update({ last_mothers_day_blast_sent_at: null })
          .eq("customer_email", c.email)
          .eq("last_mothers_day_blast_sent_at", nowIso);
      }
    }

    const updates: Partial<CampaignSettings> = {
      total_sent: settings.total_sent + sent,
      last_run_at: new Date().toISOString(),
    };
    if (sendCanary && sent > 0) updates.canary_sent = true;
    if (!settings.activated_at && sent > 0) updates.activated_at = new Date().toISOString();
    await updateCampaignSettings(supabase, updates);

    return new Response(JSON.stringify({
      ok: true,
      mode: sendCanary ? "canary" : "send",
      segment,
      ready_in_window: ready.length,
      sent,
      failed,
      errors: errors.slice(0, 20),
      sent_sample: sentEmails.slice(0, 10),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[MD-CUSTOMER-BLAST] error:", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});