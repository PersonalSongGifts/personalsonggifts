import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

const SITE_URL = "https://www.personalsonggifts.com";
const SETTINGS_KEY = "flash20_remarketing"; // single shared settings row across waves
const DEFAULT_PROMO_SLUG = "flash20"; // back-compat default
const QUALITY_SCORE_MIN = 70;

// Local-time send window (inclusive start, exclusive end). 8:00–10:00 local.
const SEND_WINDOW_START_HOUR = 8;
const SEND_WINDOW_END_HOUR = 10;
const FALLBACK_TIMEZONE = "America/New_York";

// Mother's Day 2026 = Sunday May 10
const MOTHERS_DAY_DATE_LABEL = "May 10";

interface CampaignSettings {
  paused: boolean;
  batch_size: number;
  canary_size: number;
  canary_sent: boolean;
  total_sent: number;
  // Per-slug activation timestamps live as additional keys: activated_at_<slug>
  // Legacy `activated_at` is kept for backwards compat (treated as activated_at_flash20).
  activated_at?: string | null;
  last_run_at: string | null;
  [key: string]: unknown;
}

const DEFAULT_SETTINGS: CampaignSettings = {
  paused: true,
  batch_size: 500,
  canary_size: 100,
  canary_sent: false,
  total_sent: 0,
  activated_at: null,
  last_run_at: null,
};

function activatedAtKey(slug: string) {
  return `activated_at_${slug}`;
}

function getActivatedAt(settings: CampaignSettings, slug: string): string | null {
  const keyed = settings[activatedAtKey(slug)];
  if (typeof keyed === "string") return keyed;
  // Legacy fallback for flash20
  if (slug === "flash20" && typeof settings.activated_at === "string") return settings.activated_at;
  return null;
}

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
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: FALLBACK_TIMEZONE, hour: "numeric", hour12: false });
    const parts = fmt.formatToParts(new Date());
    const hourPart = parts.find(p => p.type === "hour")?.value ?? "0";
    let h = parseInt(hourPart, 10);
    if (h === 24) h = 0;
    return h;
  }
}

function isInSendWindow(timezone: string | null | undefined): boolean {
  const h = getLocalHour(timezone);
  return h >= SEND_WINDOW_START_HOUR && h < SEND_WINDOW_END_HOUR;
}

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

/**
 * Activates the promo (sets is_active + 72h window) on first send of this slug.
 * Idempotent per-slug: if already activated for this slug, returns existing timestamp.
 */
async function ensurePromoActivated(supabase: ReturnType<typeof createClient>, slug: string) {
  const settings = await getCampaignSettings(supabase);
  const existing = getActivatedAt(settings, slug);
  if (existing) return existing;

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 72 * 60 * 60 * 1000);

  await supabase
    .from("promotions")
    .update({
      is_active: true,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
    })
    .eq("slug", slug);

  await updateCampaignSettings(supabase, { [activatedAtKey(slug)]: startsAt.toISOString() } as Partial<CampaignSettings>);
  console.log(`[REMARKETING:${slug}] Promo activated. Window: ${startsAt.toISOString()} → ${endsAt.toISOString()}`);
  return startsAt.toISOString();
}

const MD_RECIPIENT_TYPES = new Set(["wife", "mom", "mother", "grandma", "grandmother"]);
const MD_OCCASIONS = new Set(["mothers-day", "mother's day", "mothers day", "mother day"]);

function isMothersDayVariant(recipientType: string | null | undefined, occasion: string | null | undefined): boolean {
  const t = (recipientType || "").trim().toLowerCase();
  const o = (occasion || "").trim().toLowerCase().replace(/’/g, "'");
  return MD_RECIPIENT_TYPES.has(t) || MD_OCCASIONS.has(o);
}

function buildSubject(recipientName: string | null | undefined, mothersDay: boolean): string {
  const name = (recipientName || "").trim();
  if (mothersDay) {
    return name ? `Quick thing about ${name}'s song` : `Quick thing about your song`;
  }
  return name ? `Did you ever come back to ${name}'s song?` : `Did you ever come back to your song?`;
}

interface EmailParams {
  customerName: string;
  recipientName: string | null | undefined;
  recipientType: string | null | undefined;
  occasion: string | null | undefined;
  previewToken: string;
  email: string;
  promoSlug: string;
  priceLabel: string; // e.g. "$24.99"
  originalLabel: string; // e.g. "$29.99"
  endsAt?: string | null; // ISO timestamp for promo end (drives countdown)
}

function buildEmail(p: EmailParams) {
  const toTitleCase = (s: string) =>
    s.toLowerCase().replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
  const rawFirst = (p.customerName || "").trim().split(/\s+/)[0] || "";
  const firstName = rawFirst ? toTitleCase(rawFirst) : "there";
  const rawRecipient = (p.recipientName || "").trim();
  const safeRecipient = rawRecipient ? toTitleCase(rawRecipient) : "your loved one";
  const ctaUrl = `${SITE_URL}/preview/${p.previewToken}?promo=${encodeURIComponent(p.promoSlug)}`;
  const unsubscribeUrl = `${SITE_URL}/unsubscribe?email=${encodeURIComponent(p.email)}`;
  const mothersDay = isMothersDayVariant(p.recipientType, p.occasion);

  // Compute a soft countdown phrase from the promo end time.
  // Plain language only — no "ENDS SOON", no caps, no emoji.
  let countdownPhrase = "";
  if (p.endsAt) {
    const msLeft = new Date(p.endsAt).getTime() - Date.now();
    if (msLeft > 0) {
      const hoursLeft = Math.ceil(msLeft / (60 * 60 * 1000));
      if (hoursLeft <= 24) {
        countdownPhrase = hoursLeft === 1
          ? " (about 1 hour left at this price)"
          : ` (about ${hoursLeft} hours left at this price)`;
      } else {
        const daysLeft = Math.ceil(hoursLeft / 24);
        countdownPhrase = daysLeft === 1
          ? " (1 day left at this price)"
          : ` (${daysLeft} days left at this price)`;
      }
    }
  }

  const textContent = mothersDay
    ? `Hi ${firstName},

Just a heads up, the full song you started for ${safeRecipient} is already finished and waiting in your account.

You only heard the preview, but the full version's been there this whole time.

Mother's Day is ${MOTHERS_DAY_DATE_LABEL}, so there's still time if you want to use it for that.

Hear ${safeRecipient}'s full song: ${ctaUrl}

It's ${p.priceLabel} right now, down from ${p.originalLabel}.${countdownPhrase}
This offer is available for a limited time.

Personal Song Gifts

---
Personal Song Gifts
2108 N ST STE N, SACRAMENTO, CA 95816

To unsubscribe: ${unsubscribeUrl}`
    : `Hi ${firstName},

Just checking in, the full song you started for ${safeRecipient} is already finished and sitting in your account.

You only heard the 30-second preview, but the whole thing's there whenever you want to listen.

Hear ${safeRecipient}'s full song: ${ctaUrl}

It's ${p.priceLabel} right now, down from ${p.originalLabel}.${countdownPhrase}
This offer is available for a limited time.

Personal Song Gifts

---
Personal Song Gifts
2108 N ST STE N, SACRAMENTO, CA 95816

To unsubscribe: ${unsubscribeUrl}`;

  const bodyParagraphs = mothersDay
    ? `
    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
      Just a heads up, the full song you started for ${safeRecipient} is already finished and waiting in your account.
    </p>

    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
      You only heard the preview, but the full version's been there this whole time.
    </p>

    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 24px 0;">
      Mother's Day is ${MOTHERS_DAY_DATE_LABEL}, so there's still time if you want to use it for that.
    </p>`
    : `
    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
      Just checking in, the full song you started for ${safeRecipient} is already finished and sitting in your account.
    </p>

    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 24px 0;">
      You only heard the 30-second preview, but the whole thing's there whenever you want to listen.
    </p>`;

  const afterCta = mothersDay
    ? `It's ${p.priceLabel} right now, down from ${p.originalLabel}.${countdownPhrase}`
    : `It's ${p.priceLabel} right now, down from ${p.originalLabel}.${countdownPhrase}`;

  const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">Hi ${firstName},</p>
${bodyParagraphs}
    <p style="margin:0 0 28px 0;">
      <a href="${ctaUrl}" style="display:inline-block;background-color:#1E3A5F;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:6px;font-family:Arial,Helvetica,sans-serif;">Hear ${safeRecipient}'s full song →</a>
    </p>

    <p style="color:#222;font-size:18px;line-height:1.5;font-weight:bold;margin:24px 0 8px 0;">
      ${afterCta}
    </p>
    <p style="color:#555;font-size:14px;line-height:1.5;margin:0 0 32px 0;">
      This offer is available for a limited time.
    </p>

    <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 40px 0;">
      Personal Song Gifts
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

  return { subject: buildSubject(p.recipientName, mothersDay), htmlContent, textContent, ctaUrl, mothersDay };
}

async function sendOneEmail(
  brevoApiKey: string,
  params: EmailParams,
  leadId: string,
): Promise<{ ok: boolean; error?: string; subject?: string; mothersDay?: boolean }> {
  const { subject, htmlContent, textContent, mothersDay } = buildEmail(params);
  const messageId = `<${leadId}.${params.promoSlug}.${Date.now()}@personalsonggifts.com>`;
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
  return { ok: true, subject, mothersDay };
}

/**
 * Build the eligibility query for a given promo slug.
 *
 * Filters:
 *  - preview was sent + has token + has full_song_url (so checkout works)
 *  - not converted, not dismissed
 *  - captured 5+ days ago
 *  - quality_score >= 70
 *  - has NOT received this slug yet (per-slug activity-log isolation; allows leads to receive multiple waves)
 *
 * NOTE: We do NOT filter on last_promo_email_sent_at here. That column is used only as
 * a slug-agnostic atomic CAS lock during the actual send loop to prevent duplicate sends
 * from concurrent cron invocations.
 */
function buildEligibilityQuery(supabase: ReturnType<typeof createClient>, promoSlug: string, exact: boolean) {
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  // PostgREST `not(...)` syntax: column.<op>.<value>. For NOT-EXISTS on jsonb activity_log we'd need a join.
  // Since order_activity_log is a separate table, we filter post-fetch using an in-memory set
  // for the small batch sizes we use. For `count: exact` accuracy we run a separate count query.
  return supabase
    .from("leads")
    .select(
      "id, email, customer_name, recipient_name, recipient_type, occasion, preview_token, last_promo_email_sent_at, timezone, quality_score, full_song_url",
      exact ? { count: "exact" } : undefined,
    )
    .not("preview_sent_at", "is", null)
    .not("preview_song_url", "is", null)
    .not("preview_token", "is", null)
    .not("full_song_url", "is", null)
    .neq("status", "converted")
    .is("dismissed_at", null)
    .lt("captured_at", fiveDaysAgo)
    .gte("quality_score", QUALITY_SCORE_MIN);
}

/**
 * Returns set of lead IDs (from the provided list) that already have a `<slug>_sent` activity log entry.
 * Used to filter out already-emailed leads for this specific wave.
 */
async function getLeadsAlreadySentSlug(
  supabase: ReturnType<typeof createClient>,
  leadIds: string[],
  promoSlug: string,
): Promise<Set<string>> {
  if (leadIds.length === 0) return new Set();
  const eventType = `${promoSlug}_sent`;
  // Chunk to avoid IN clause limits
  const result = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < leadIds.length; i += CHUNK) {
    const slice = leadIds.slice(i, i + CHUNK);
    const { data } = await supabase
      .from("order_activity_log")
      .select("entity_id")
      .eq("entity_type", "lead")
      .eq("event_type", eventType)
      .in("entity_id", slice);
    for (const row of (data || [])) result.add((row as { entity_id: string }).entity_id);
  }
  return result;
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
    const { dryRun, testEmails, send, testRecipientType, testCarrierLeadId, revertTestCarrier } = body;
    const promoSlug: string = typeof body.promoSlug === "string" && body.promoSlug.length > 0
      ? body.promoSlug
      : DEFAULT_PROMO_SLUG;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const brevoApiKey = Deno.env.get("BREVO_API_KEY") || "";

    if ((body.send || (body.testEmails && Array.isArray(body.testEmails) && body.testEmails.length > 0)) && !brevoApiKey) {
      console.error("[REMARKETING] BREVO_API_KEY env var is missing or empty — aborting send.");
      return new Response(JSON.stringify({ error: "BREVO_API_KEY not configured on the edge function environment." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Resolve promo row (price + active state) — needed for email pricing labels and a sanity warning
    const { data: promoRow } = await supabase
      .from("promotions")
      .select("slug, lead_price_cents, standard_price_cents, is_active, targeted, starts_at, ends_at")
      .eq("slug", promoSlug)
      .maybeSingle();

    if (!promoRow) {
      return new Response(JSON.stringify({ error: `Promo '${promoSlug}' not found in promotions table.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!promoRow.targeted) {
      return new Response(JSON.stringify({ error: `Promo '${promoSlug}' is not marked targeted=true. Refusing to use it for remarketing.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const priceLabel = `$${(promoRow.lead_price_cents / 100).toFixed(2)}`;
    const originalLabel = `$${(promoRow.standard_price_cents / 100).toFixed(2)}`;

    // ---- REVERT TEST CARRIER ----
    if (revertTestCarrier && typeof testCarrierLeadId === "string" && testCarrierLeadId.length > 0) {
      const eventType = `${promoSlug}_sent`;
      const { data: deleted } = await supabase
        .from("order_activity_log")
        .delete()
        .eq("entity_type", "lead")
        .eq("entity_id", testCarrierLeadId)
        .eq("event_type", eventType)
        .select("id");
      // Clear the CAS lock so this lead can still receive a real send
      await supabase
        .from("leads")
        .update({ last_promo_email_sent_at: null })
        .eq("id", testCarrierLeadId);
      return new Response(JSON.stringify({
        revertTestCarrier: true,
        leadId: testCarrierLeadId,
        promoSlug,
        deletedLogRows: (deleted || []).length,
        message: "Carrier lead's test_sent log + send-claim cleared. Lead is now eligible for production sends again.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- DRY RUN ----
    if (dryRun) {
      const settings = await getCampaignSettings(supabase);

      // Get up to 2000 candidates, then filter out leads who already received this slug.
      const { data: rawCandidates, count: rawCount } = await buildEligibilityQuery(supabase, promoSlug, true).limit(2000);
      const candidateIds = (rawCandidates || []).map(l => (l as { id: string }).id);
      const alreadySent = await getLeadsAlreadySentSlug(supabase, candidateIds, promoSlug);
      const filtered = (rawCandidates || []).filter(l => !alreadySent.has((l as { id: string }).id));

      // Approximate the true total: we have `rawCount` matching the base query;
      // we don't know the exact slug-already-sent count for the full pool without scanning.
      // Run a count of activity log entries for this slug as the upper bound on overlap.
      const { count: alreadySentTotal } = await supabase
        .from("order_activity_log")
        .select("entity_id", { count: "exact", head: true })
        .eq("entity_type", "lead")
        .eq("event_type", `${promoSlug}_sent`);

      const { count: suppressedCount } = await supabase
        .from("email_suppressions").select("email", { count: "exact", head: true });

      let inWindowNow = 0;
      let waiting = 0;
      const tzBreakdown: Record<string, { total: number; inWindow: number }> = {};
      for (const l of filtered) {
        const tz = (l as { timezone?: string | null }).timezone || FALLBACK_TIMEZONE;
        const inWin = isInSendWindow(tz);
        if (inWin) inWindowNow++; else waiting++;
        if (!tzBreakdown[tz]) tzBreakdown[tz] = { total: 0, inWindow: 0 };
        tzBreakdown[tz].total++;
        if (inWin) tzBreakdown[tz].inWindow++;
      }

      return new Response(JSON.stringify({
        dryRun: true,
        promoSlug,
        priceLabel,
        originalLabel,
        endsAt: promoRow.ends_at,
        baseQueryMatched: rawCount || 0,
        alreadyReceivedThisSlug_total: alreadySentTotal || 0,
        sampledAndUnsentForThisSlug: filtered.length,
        sampleCap: 2000,
        suppressedEmails: suppressedCount || 0,
        sendWindow: { startHourLocal: SEND_WINDOW_START_HOUR, endHourLocal: SEND_WINDOW_END_HOUR },
        inSendWindowNow: inWindowNow,
        waitingForLocalMorning: waiting,
        timezoneBreakdownSample: tzBreakdown,
        settings,
        sample: filtered.slice(0, 10).map(l => {
          const lead = l as { email: string; customer_name: string; recipient_name: string; timezone: string | null; preview_token: string };
          return {
            email: lead.email,
            customer_name: lead.customer_name,
            recipient_name: lead.recipient_name,
            recipient_type: (lead as { recipient_type?: string | null }).recipient_type,
            occasion: (lead as { occasion?: string | null }).occasion,
            timezone: lead.timezone,
            local_hour: getLocalHour(lead.timezone),
            in_window_now: isInSendWindow(lead.timezone),
            has_token: !!lead.preview_token,
          };
        }),
        note: "Only leads in their local 8–10 AM window are sent to per run. Re-run hourly to drain all timezones. Per-wave isolation via `<slug>_sent` activity log; the same lead can receive both waves.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- TEST MODE ----
    if (testEmails && Array.isArray(testEmails) && testEmails.length > 0) {
      // Activate promo if not yet activated for this slug (so test links use the discounted price)
      await ensurePromoActivated(supabase, promoSlug);

      // Re-fetch ends_at after activation so the email countdown reflects the live window.
      const { data: refreshedPromo } = await supabase
        .from("promotions")
        .select("ends_at")
        .eq("slug", promoSlug)
        .maybeSingle();
      const liveEndsAt = (refreshedPromo as { ends_at?: string | null } | null)?.ends_at
        ?? new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

      // Resolve carrier lead: explicit testCarrierLeadId (preferred) or by-email match or fallback
      let carrierLead: { id: string; email: string; customer_name: string; recipient_name: string | null; recipient_type: string | null; occasion: string | null; preview_token: string | null } | null = null;
      let carrierLogWritten = false;

      if (typeof testCarrierLeadId === "string" && testCarrierLeadId.length > 0) {
        const { data } = await supabase
          .from("leads")
          .select("id, email, customer_name, recipient_name, recipient_type, occasion, preview_token, full_song_url")
          .eq("id", testCarrierLeadId)
          .maybeSingle();
        if (!data) {
          return new Response(JSON.stringify({ error: `testCarrierLeadId '${testCarrierLeadId}' not found.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (!(data as { preview_token: string | null }).preview_token) {
          return new Response(JSON.stringify({ error: "Carrier lead has no preview_token." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        carrierLead = data as typeof carrierLead;
        // Pre-write the slug_sent log entry for this carrier so the preview page
        // recognizes the test email link as eligible for the discounted price.
        // The admin "Revert Test Carrier" button removes this afterward.
        const { data: existingLog } = await supabase
          .from("order_activity_log")
          .select("id")
          .eq("entity_type", "lead")
          .eq("entity_id", carrierLead!.id)
          .eq("event_type", `${promoSlug}_sent`)
          .limit(1)
          .maybeSingle();
        if (!existingLog) {
          await supabase.from("order_activity_log").insert({
            entity_type: "lead",
            entity_id: carrierLead!.id,
            event_type: `${promoSlug}_sent`,
            actor: "admin",
            details: `[TEST CARRIER] Pre-seeded so preview page renders ${promoSlug} pricing for test send`,
          });
          carrierLogWritten = true;
        }
      }

      const results: { email: string; sent: boolean; variant?: string; subject?: string; carrierLeadId?: string; error?: string }[] = [];
      for (const email of testEmails) {
        let lead = carrierLead;
        if (!lead) {
          const { data } = await supabase
            .from("leads")
            .select("id, email, customer_name, recipient_name, recipient_type, occasion, preview_token, full_song_url")
            .eq("email", email)
            .not("preview_token", "is", null)
            .order("captured_at", { ascending: false })
            .limit(1).maybeSingle();
          if (data) lead = data as typeof lead;
        }

        let testToken = lead?.preview_token || null;
        let testCustomer = lead?.customer_name || "Test User";
        let testRecipient: string | null | undefined = lead?.recipient_name || "Sample";
        let testRecType: string | null | undefined = testRecipientType || lead?.recipient_type || "wife";
        let testOccasion: string | null | undefined = lead?.occasion || "mothers-day";

        if (!testToken) {
          const { data: anyLead } = await supabase
            .from("leads")
            .select("preview_token, customer_name, recipient_name")
            .not("preview_token", "is", null)
            .not("preview_song_url", "is", null)
            .limit(1).maybeSingle();
          testToken = (anyLead as { preview_token?: string } | null)?.preview_token || "test-token";
          if (anyLead) testRecipient = (anyLead as { recipient_name?: string }).recipient_name ?? testRecipient;
        }

        const r = await sendOneEmail(brevoApiKey, {
          customerName: testCustomer,
          recipientName: testRecipient,
          recipientType: testRecType,
          occasion: testOccasion,
          previewToken: testToken!,
          email,
          promoSlug,
          priceLabel,
          originalLabel,
          endsAt: liveEndsAt,
        }, lead?.id || "test");

        results.push({
          email,
          sent: r.ok,
          variant: r.mothersDay ? "mothers_day" : "generic",
          subject: r.subject,
          carrierLeadId: lead?.id,
          error: r.error,
        });
      }

      return new Response(JSON.stringify({
        testMode: true,
        promoSlug,
        priceLabel,
        originalLabel,
        endsAt: promoRow.ends_at,
        carrierLeadId: carrierLead?.id || null,
        carrierLogWritten,
        carrierLogNote: carrierLogWritten
          ? "Pre-seeded `<slug>_sent` for the carrier lead so the preview page renders the discounted price. Click 'Revert Test Carrier' before going to production to clear it."
          : (carrierLead ? "Carrier lead already had a `<slug>_sent` entry — left as-is." : "No testCarrierLeadId provided — preview page may not show discounted price for test recipients."),
        results,
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

      // Activate promo on first send (sets ends_at = now + 72h) for this slug
      await ensurePromoActivated(supabase, promoSlug);

      // Re-fetch ends_at after activation so the email countdown reflects the live window.
      const { data: refreshedProdPromo } = await supabase
        .from("promotions")
        .select("ends_at")
        .eq("slug", promoSlug)
        .maybeSingle();
      const liveProdEndsAt = (refreshedProdPromo as { ends_at?: string | null } | null)?.ends_at
        ?? new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

      const targetBatchSize = Math.min(1000, settings.canary_sent ? settings.batch_size : settings.canary_size);

      // Fetch a generous over-pool so we can filter out already-sent-this-slug leads and still hit batch size.
      const fetchSize = Math.min(2000, targetBatchSize * 4);
      const { data: rawCandidates, error: fetchErr } = await buildEligibilityQuery(supabase, promoSlug, false).limit(fetchSize);
      if (fetchErr) throw fetchErr;
      if (!rawCandidates || rawCandidates.length === 0) {
        return new Response(JSON.stringify({
          send: true, promoSlug, eligible: 0, sent: 0, failed: 0, remaining: 0,
          message: "No eligible leads remaining (base query empty).",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Per-slug activity-log filter: drop leads who already received THIS wave.
      const candidateIds = rawCandidates.map(c => (c as { id: string }).id);
      const alreadySent = await getLeadsAlreadySentSlug(supabase, candidateIds, promoSlug);
      const candidates = rawCandidates.filter(c => !alreadySent.has((c as { id: string }).id));
      const skippedAlreadySentSlug = rawCandidates.length - candidates.length;

      // Timezone bucketing
      const ignoreTimezoneWindow = body.ignoreTimezoneWindow === true;
      const preTzCount = candidates.length;
      const tzFiltered = ignoreTimezoneWindow
        ? candidates
        : candidates.filter(c => isInSendWindow((c as { timezone?: string | null }).timezone));
      const skippedOutOfWindow = preTzCount - tzFiltered.length;

      if (tzFiltered.length === 0) {
        return new Response(JSON.stringify({
          send: true,
          promoSlug,
          eligible: 0,
          sent: 0,
          failed: 0,
          skippedAlreadySentSlug,
          skippedOutOfWindow,
          remaining: preTzCount,
          sendWindow: { startHourLocal: SEND_WINDOW_START_HOUR, endHourLocal: SEND_WINDOW_END_HOUR },
          message: `No leads currently in their local ${SEND_WINDOW_START_HOUR}–${SEND_WINDOW_END_HOUR} AM window. ${preTzCount} leads waiting for their morning.`,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const candidateEmails = tzFiltered.map(c => (c as { email: string }).email.toLowerCase());

      // Filter suppressed
      const { data: suppressed } = await supabase
        .from("email_suppressions").select("email").in("email", candidateEmails);
      const suppressedSet = new Set((suppressed || []).map(s => ((s as { email: string }).email).toLowerCase()));

      // Filter existing customers (any non-cancelled order)
      const { data: paidOrders } = await supabase
        .from("orders").select("customer_email").in("customer_email", candidateEmails).neq("status", "cancelled");
      const paidSet = new Set((paidOrders || []).map(o => ((o as { customer_email: string }).customer_email).toLowerCase()));

      const eligible = tzFiltered.filter(c => {
        const e = (c as { email: string }).email.toLowerCase();
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
              send: true, promoSlug, pausedMidRun: true, attempted: attemptCounter, sent: totalSent, failed: totalFailed,
              skipped, remaining: eligible.length - i, errors,
            }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          await new Promise(r => setTimeout(r, 500));
        }

        const chunk = eligible.slice(i, i + CHUNK_SIZE);
        for (const leadRow of chunk) {
          const lead = leadRow as {
            id: string;
            email: string;
            customer_name: string;
            recipient_name: string | null;
            recipient_type: string | null;
            occasion: string | null;
            preview_token: string | null;
            last_promo_email_sent_at: string | null;
          };

          if (!lead.preview_token) {
            skipped.missing_token++;
            console.log(`[REMARKETING:${promoSlug}] Skipped lead ${lead.id}: missing preview_token`);
            continue;
          }

          // Atomic CAS claim on last_promo_email_sent_at — slug-agnostic race lock.
          // Allowed transitions: NULL -> now, OR oldValue -> now (idempotent CAS, fine for cross-wave).
          const claimTime = new Date().toISOString();
          const priorPromoSentAt = lead.last_promo_email_sent_at ?? null;
          let claimQuery = supabase
            .from("leads")
            .update({ last_promo_email_sent_at: claimTime })
            .eq("id", lead.id);

          claimQuery = priorPromoSentAt
            ? claimQuery.eq("last_promo_email_sent_at", priorPromoSentAt)
            : claimQuery.is("last_promo_email_sent_at", null);

          const { data: claimed, error: claimErr } = await claimQuery.select("id").maybeSingle();

          if (claimErr || !claimed) {
            skipped.claim_failed++;
            console.log(`[REMARKETING:${promoSlug}] Claim skipped for ${lead.id} (race or already sent)${claimErr ? ` err=${claimErr.message}` : ""}`);
            continue;
          }

          attemptCounter++;
          let r: { ok: boolean; error?: string };
          try {
            r = await sendOneEmail(brevoApiKey, {
              customerName: lead.customer_name,
              recipientName: lead.recipient_name,
              recipientType: lead.recipient_type,
              occasion: lead.occasion,
              previewToken: lead.preview_token!,
              email: lead.email,
              promoSlug,
              priceLabel,
              originalLabel,
              endsAt: liveProdEndsAt,
            }, lead.id);
          } catch (sendErr) {
            skipped.send_threw++;
            const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
            console.error(`[REMARKETING:${promoSlug}] sendOneEmail threw for ${lead.email}: ${msg}`);
            await supabase.from("leads").update({ last_promo_email_sent_at: priorPromoSentAt }).eq("id", lead.id);
            totalFailed++;
            errors.push({ email: lead.email, error: `threw: ${msg}` });
            continue;
          }
          if (r.ok) {
            totalSent++;
            await supabase.from("order_activity_log").insert({
              entity_type: "lead", entity_id: lead.id,
              event_type: `${promoSlug}_sent`, actor: "system",
              details: `${promoSlug} (${priceLabel} / 72h) remarketing email sent to ${lead.email}`,
            });
          } else {
            await supabase.from("leads").update({ last_promo_email_sent_at: priorPromoSentAt }).eq("id", lead.id);
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

      console.log(`[REMARKETING:${promoSlug}] Batch complete: eligible=${eligible.length} attempted=${attemptCounter} sent=${totalSent} failed=${totalFailed} skipped=`, skipped);
      if (errors.length > 0) {
        console.error(`[REMARKETING:${promoSlug}] First error:`, errors[0]);
      }

      return new Response(JSON.stringify({
        send: true,
        promoSlug,
        priceLabel,
        originalLabel,
        endsAt: promoRow.ends_at,
        eligible: eligible.length,
        attempted: attemptCounter,
        skipped,
        skippedAlreadySentSlug,
        skippedOutOfWindow,
        sendWindow: { startHourLocal: SEND_WINDOW_START_HOUR, endHourLocal: SEND_WINDOW_END_HOUR },
        ignoreTimezoneWindow,
        sent: totalSent,
        failed: totalFailed,
        canaryBatch: !settings.canary_sent,
        errors: errors.slice(0, 20),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- STATS ----
    if (body.stats) {
      const settings = await getCampaignSettings(supabase);
      const eventType = `${promoSlug}_sent`;

      const { count: sentCount } = await supabase
        .from("order_activity_log")
        .select("id", { count: "exact", head: true })
        .eq("entity_type", "lead").eq("event_type", eventType);

      let conversions = 0;
      let revenueCents = 0;
      const activatedAt = getActivatedAt(settings, promoSlug);
      if (activatedAt) {
        // Get lead IDs that received THIS wave
        const { data: sentLogs } = await supabase
          .from("order_activity_log")
          .select("entity_id")
          .eq("entity_type", "lead").eq("event_type", eventType);
        const sentLeadIds = Array.from(new Set((sentLogs || []).map(l => (l as { entity_id: string }).entity_id)));

        // Of those, who converted after activation?
        const CHUNK = 500;
        const convertedOrderIds: string[] = [];
        for (let i = 0; i < sentLeadIds.length; i += CHUNK) {
          const slice = sentLeadIds.slice(i, i + CHUNK);
          const { data: converted } = await supabase
            .from("leads")
            .select("id, order_id, converted_at")
            .in("id", slice)
            .not("converted_at", "is", null)
            .gte("converted_at", activatedAt)
            .not("order_id", "is", null);
          for (const l of (converted || [])) {
            conversions++;
            const orderId = (l as { order_id: string | null }).order_id;
            if (orderId) convertedOrderIds.push(orderId);
          }
        }

        if (convertedOrderIds.length > 0) {
          for (let i = 0; i < convertedOrderIds.length; i += CHUNK) {
            const slice = convertedOrderIds.slice(i, i + CHUNK);
            const { data: orders } = await supabase
              .from("orders").select("price_cents, price").in("id", slice);
            revenueCents += (orders || []).reduce((sum, o) => {
              const row = o as { price_cents: number | null; price: number | null };
              return sum + (row.price_cents ?? (row.price ? row.price * 100 : 0));
            }, 0);
          }
        }
      }

      return new Response(JSON.stringify({
        stats: true,
        promoSlug,
        sent: sentCount || 0,
        conversions,
        revenueCents,
        promo: promoRow,
        activated_at: activatedAt,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- RESET ----
    if (body.reset) {
      // Reset clears ALL per-slug activated_at keys + counters. The promo rows themselves are NOT touched here
      // (do that via the admin promotions panel or DB tool).
      await supabase.from("admin_settings").upsert({
        key: SETTINGS_KEY,
        value: JSON.stringify({ ...DEFAULT_SETTINGS, paused: true }),
        updated_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ reset: true, message: "Campaign settings reset. Per-slug activated_at cleared. Promo rows unchanged." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Provide dryRun, testEmails, send, stats, reset, or revertTestCarrier" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[REMARKETING] error:", error);
    const msg = error instanceof Error ? error.message : "Server error";
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
