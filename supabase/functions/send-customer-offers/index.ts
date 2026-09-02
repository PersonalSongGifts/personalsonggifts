import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2.93.1/cors";
import { escapeHtml, inSendWindow } from "../_shared/lead-followup.ts";
import { logActivity } from "../_shared/activity-log.ts";

const SENDER_EMAIL = "support@personalsonggifts.com";
const SENDER_NAME = "Personal Song Gifts";
const SITE_URL = "https://www.personalsonggifts.com";
const UNSUBSCRIBE_SITE_URL = "https://personalsonggifts.lovable.app/unsubscribe";
const MAX_PER_RUN = 60;
const DAILY_CEILING = 400;
const FALLBACK_TIMEZONE = "America/New_York";

type OfferKind = "bonus" | "download";
type OrderCandidate = {
  id: string;
  customer_email: string;
  customer_name: string;
  recipient_name: string;
  timezone: string | null;
  created_at: string;
  bonus_song_url?: string | null;
  bonus_unlocked_at?: string | null;
  package_unlocked_at?: string | null;
  bonus_offer_email_sent_at?: string | null;
  download_unlocked_at?: string | null;
  download_offer_email_sent_at?: string | null;
};

type StageResult = {
  eligible: number;
  sent: number;
  skippedWindow: number;
  skippedSuppressed: number;
  candidateOrderIds?: string[];
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapedIlikeValue(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

function offerColumn(kind: OfferKind): "bonus_offer_email_sent_at" | "download_offer_email_sent_at" {
  return kind === "bonus" ? "bonus_offer_email_sent_at" : "download_offer_email_sent_at";
}

function makeEmail(kind: OfferKind, order: OrderCandidate): { subject: string; textContent: string; htmlContent: string } {
  const name = firstName(order.customer_name);
  const recipient = order.recipient_name;
  const songPageUrl = `${SITE_URL}/song/${order.id.slice(0, 8)}`;
  const unsubscribeUrl = `${UNSUBSCRIBE_SITE_URL}?email=${encodeURIComponent(order.customer_email)}`;
  const safeName = escapeHtml(name);
  const safeRecipient = escapeHtml(recipient);
  const safeSongPageUrl = escapeHtml(songPageUrl);
  const safeUnsubscribeUrl = escapeHtml(unsubscribeUrl);

  if (kind === "bonus") {
    return {
      subject: `A second version of ${recipient}'s song`,
      textContent: `Hi ${name},

When we made ${recipient}'s song, we also recorded a second version in a different style — same words, a whole new feel. It's been waiting on the song page.

You can hear a preview there and unlock the full version for $19.99:
${songPageUrl}

If you'd rather not, no problem — the original is yours forever either way.

— Sara at Personal Song Gifts

---
Personal Song Gifts
2108 N ST STE N, SACRAMENTO, CA 95816

To unsubscribe: ${unsubscribeUrl}`,
      htmlContent: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;"><div style="max-width:600px;margin:0 auto;padding:40px 20px;">
<p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">Hi ${safeName},</p>
<p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">When we made ${safeRecipient}'s song, we also recorded a second version in a different style — same words, a whole new feel. It's been waiting on the song page.</p>
<p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">You can hear a preview there and unlock the full version for $19.99:</p>
<p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 16px 0;"><a href="${safeSongPageUrl}" style="color:#1E3A5F;">${safeSongPageUrl}</a></p>
<p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">If you'd rather not, no problem — the original is yours forever either way.</p>
<p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 40px 0;">— Sara at Personal Song Gifts</p>
<hr style="border:none;border-top:1px solid #eeeeee;margin:0 0 20px 0;">
<p style="color:#999999;font-size:12px;margin:0 0 6px 0;">Personal Song Gifts &bull; 2108 N ST STE N, SACRAMENTO, CA 95816</p>
<p style="color:#999999;font-size:12px;margin:0;"><a href="${safeUnsubscribeUrl}" style="color:#999999;">Unsubscribe</a></p>
</div></body></html>`,
    };
  }

  return {
    subject: `Keep ${recipient}'s song forever`,
    textContent: `Hi ${name},

${recipient}'s song page isn't going anywhere — but a lot of people want the file itself: to keep it on their phone, play it without internet, or put it in a video.

Song download + usage rights is $19.99 on the song page:
${songPageUrl}

Questions? Just reply — a real person reads these.

— Sara at Personal Song Gifts

---
Personal Song Gifts
2108 N ST STE N, SACRAMENTO, CA 95816

To unsubscribe: ${unsubscribeUrl}`,
    htmlContent: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;"><div style="max-width:600px;margin:0 auto;padding:40px 20px;">
<p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">Hi ${safeName},</p>
<p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">${safeRecipient}'s song page isn't going anywhere — but a lot of people want the file itself: to keep it on their phone, play it without internet, or put it in a video.</p>
<p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">Song download + usage rights is $19.99 on the song page:</p>
<p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 16px 0;"><a href="${safeSongPageUrl}" style="color:#1E3A5F;">${safeSongPageUrl}</a></p>
<p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 16px 0;">Questions? Just reply — a real person reads these.</p>
<p style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 40px 0;">— Sara at Personal Song Gifts</p>
<hr style="border:none;border-top:1px solid #eeeeee;margin:0 0 20px 0;">
<p style="color:#999999;font-size:12px;margin:0 0 6px 0;">Personal Song Gifts &bull; 2108 N ST STE N, SACRAMENTO, CA 95816</p>
<p style="color:#999999;font-size:12px;margin:0;"><a href="${safeUnsubscribeUrl}" style="color:#999999;">Unsubscribe</a></p>
</div></body></html>`,
  };
}

function isEligible(kind: OfferKind, order: OrderCandidate, nowMs: number, fourteenDaysAgoMs: number, sevenDaysAgoMs: number): boolean {
  if (new Date(order.created_at).getTime() >= fourteenDaysAgoMs) return false;
  if (kind === "bonus") {
    return Boolean(order.bonus_song_url)
      && !order.bonus_unlocked_at
      && !order.package_unlocked_at
      && !order.bonus_offer_email_sent_at;
  }
  return !order.package_unlocked_at
    && !order.download_unlocked_at
    && !order.download_offer_email_sent_at
    && (!order.bonus_offer_email_sent_at || new Date(order.bonus_offer_email_sent_at).getTime() < sevenDaysAgoMs)
    && nowMs > fourteenDaysAgoMs;
}

async function getQualifyingOrders(supabase: ReturnType<typeof createClient>, kind: OfferKind, now: Date): Promise<OrderCandidate[]> {
  const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from("orders")
    .select("id, customer_email, customer_name, recipient_name, timezone, created_at, bonus_song_url, bonus_unlocked_at, package_unlocked_at, bonus_offer_email_sent_at, download_unlocked_at, download_offer_email_sent_at")
    .neq("status", "cancelled")
    .not("delivered_at", "is", null)
    .lt("created_at", cutoff)
    .is(offerColumn(kind), null)
    .is("package_unlocked_at", null)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (kind === "bonus") {
    query = query.not("bonus_song_url", "is", null).is("bonus_unlocked_at", null).not("occasion", "in", '("memorial","pet-memorial")');
  } else {
    query = query.is("download_unlocked_at", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  const nowMs = now.getTime();
  const fourteenDaysAgoMs = nowMs - 14 * 24 * 60 * 60 * 1000;
  const sevenDaysAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  return ((data || []) as OrderCandidate[]).filter((order) => isEligible(kind, order, nowMs, fourteenDaysAgoMs, sevenDaysAgoMs));
}

function dedupeByCustomer(orders: OrderCandidate[]): OrderCandidate[] {
  const seen = new Set<string>();
  return orders.filter((order) => {
    const email = order.customer_email.trim().toLowerCase();
    if (!email || seen.has(email)) return false;
    seen.add(email);
    return true;
  });
}

async function sendOffer(supabase: ReturnType<typeof createClient>, kind: OfferKind, order: OrderCandidate, claimStamp: string): Promise<"sent" | "definite-failure"> {
  const brevoKey = Deno.env.get("BREVO_API_KEY");
  if (!brevoKey) throw new Error("BREVO_API_KEY not configured");

  const email = makeEmail(kind, order);
  const unsubscribeUrl = `${UNSUBSCRIBE_SITE_URL}?email=${encodeURIComponent(order.customer_email)}`;
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": brevoKey,
    },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      replyTo: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: order.customer_email, name: order.customer_name }],
      subject: email.subject,
      htmlContent: email.htmlContent,
      textContent: email.textContent,
      headers: {
        "Message-ID": `<${order.id}.${kind}.${Date.now()}@personalsonggifts.com>`,
        "X-Entity-Ref-ID": order.id,
        "List-Unsubscribe": `<mailto:${SENDER_EMAIL}?subject=Unsubscribe>, <${SITE_URL.replace("www.", "")}/functions/v1/unsubscribe-email?email=${encodeURIComponent(order.customer_email)}>` ,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[CUSTOMER-OFFER] Brevo ${kind} failed [${response.status}]: ${errorBody}`);
    await supabase.from("orders").update({ [offerColumn(kind)]: null }).eq("id", order.id).eq(offerColumn(kind), claimStamp);
    return "definite-failure";
  }

  return "sent";
}

async function runStage(supabase: ReturnType<typeof createClient>, kind: OfferKind, enabled: boolean, dryRun: boolean, now: Date): Promise<StageResult> {
  const empty: StageResult = { eligible: 0, sent: 0, skippedWindow: 0, skippedSuppressed: 0, ...(dryRun ? { candidateOrderIds: [] } : {}) };
  if (!enabled) return empty;

  const column = offerColumn(kind);
  const startOfTodayUtc = new Date(now);
  startOfTodayUtc.setUTCHours(0, 0, 0, 0);
  const { count: sentToday, error: countError } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .gte(column, startOfTodayUtc.toISOString());
  if (countError) throw countError;
  if ((sentToday || 0) >= DAILY_CEILING) return empty;

  const qualifying = dedupeByCustomer(await getQualifyingOrders(supabase, kind, now));
  const result: StageResult = {
    eligible: qualifying.length,
    sent: 0,
    skippedWindow: 0,
    skippedSuppressed: 0,
    ...(dryRun ? { candidateOrderIds: qualifying.slice(0, 5).map((order) => order.id) } : {}),
  };
  if (dryRun) return result;

  const { data: suppressions, error: suppressionError } = await supabase.from("email_suppressions").select("email");
  if (suppressionError) throw suppressionError;
  const suppressed = new Set((suppressions || []).map((row) => String(row.email).trim().toLowerCase()));
  const remaining = Math.min(MAX_PER_RUN, DAILY_CEILING - (sentToday || 0));

  for (const order of qualifying) {
    if (result.sent >= remaining) break;
    const lowerEmail = order.customer_email.trim().toLowerCase();
    if (suppressed.has(lowerEmail)) {
      result.skippedSuppressed += 1;
      continue;
    }
    if (!inSendWindow(order.timezone || FALLBACK_TIMEZONE, now)) {
      result.skippedWindow += 1;
      continue;
    }

    const claimStamp = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase
      .from("orders")
      .update({ [column]: claimStamp })
      .eq("id", order.id)
      .is(column, null)
      .select("id")
      .maybeSingle();
    if (claimError) {
      console.error(`[CUSTOMER-OFFER] Claim failed for ${kind} order ${order.id}:`, claimError);
      continue;
    }
    if (!claimed) continue;

    try {
      const outcome = await sendOffer(supabase, kind, order, claimStamp);
      if (outcome === "sent") {
        const customerOrders = await getQualifyingOrders(supabase, kind, now);
        const matchingIds = customerOrders
          .filter((candidate) => candidate.customer_email.trim().toLowerCase() === lowerEmail)
          .map((candidate) => candidate.id);
        if (matchingIds.length > 0) {
          await supabase.from("orders").update({ [column]: claimStamp }).in("id", matchingIds).is(column, null);
        }
        await logActivity(supabase, "order", order.id, kind === "bonus" ? "bonus_offer_sent" : "download_offer_sent", "system", `Customer ${kind} offer sent to ${order.customer_email}`);
        result.sent += 1;
      }
    } catch (error) {
      console.error(`[CUSTOMER-OFFER] Network/send error for ${kind} order ${order.id}; keeping claim:`, error);
    }
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST required" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    if (body && typeof body !== "object") return jsonResponse({ error: "Invalid request body" }, 400);
    const dryRun = body?.dryRun === true;
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Backend service credentials are not configured");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: flags, error: flagsError } = await supabase
      .from("admin_settings")
      .select("key, value")
      .in("key", ["customer_offer_bonus_enabled", "customer_offer_download_enabled"]);
    if (flagsError) throw flagsError;
    const flagMap = new Map((flags || []).map((row) => [row.key, row.value === "true"]));
    const now = new Date();
    const bonus = await runStage(supabase, "bonus", flagMap.get("customer_offer_bonus_enabled") === true, dryRun, now);
    const download = await runStage(supabase, "download", flagMap.get("customer_offer_download_enabled") === true, dryRun, now);
    return jsonResponse({ bonus, download });
  } catch (error) {
    console.error("Send customer offers error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Server error" }, 500);
  }
});
