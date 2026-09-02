/**
 * Shared helpers for the lead win-back email sequence (emails 2 and 3).
 *
 * These emails are marketing content sent to people who asked for a song
 * preview and never bought. Everything here is deliberately conservative:
 * quotes are only reused when they are plainly safe, sends are jittered and
 * time-windowed, and the "we'll stop" promise is honoured via
 * followup_completed_at.
 */

import { followupDiscountPhrase } from "./lead-checkout.ts";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SENSITIVE_PATTERNS: RegExp[] = [
  /\bpassed away\b/i,
  /\bpassed\b/i,
  /\bdied\b/i,
  /\bdeath\b/i,
  /\bfuneral\b/i,
  /\bheaven\b/i,
  /\brest in peace\b/i,
  /\brip\b/i,
  /\blate husband\b/i,
  /\blate wife\b/i,
  /\bcancer\b/i,
  /\bhospice\b/i,
  /\bmiss you\b/i,
  /\bmissing you\b/i,
  /\bgone\b/i,
  /\bmemorial\b/i,
  /\bin memory\b/i,
  /\bdivorce\b/i,
  /\bbreakup\b/i,
  /\bbroke up\b/i,
  /\bcheated\b/i,
  /\bhospital\b/i,
  /\bsick\b/i,
  /\billness\b/i,
  /\bsurgery\b/i,
  /\bsuicide\b/i,
  /\bdepression\b/i,
];

export function sanitizeQuote(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/\s+/g, " ");
  if (!s) return null;

  // Anything that smells like markup, links, handles, or long digit runs is out.
  if (s.includes("<") || s.includes(">") || /http/i.test(s) || /www\./i.test(s) || s.includes("@") || /\d{7,}/.test(s)) {
    return null;
  }

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(s)) return null;
  }

  if (s.length < 25) return null;

  if (s.length > 200) {
    const cut = s.slice(0, 200);
    const lastSpace = cut.lastIndexOf(" ");
    s = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim() + "…";
  }

  const letters = s.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 0) {
    const uppers = s.replace(/[^A-Z]/g, "").length;
    if (uppers / letters.length > 0.7) {
      const lowered = s.toLowerCase();
      s = lowered.charAt(0).toUpperCase() + lowered.slice(1);
    }
  }

  // Strip surrounding quote characters (we add our own).
  s = s.replace(/^["'“”‘’\s]+/, "").replace(/["'“”‘’\s]+$/, "").trim();
  if (!s) return null;

  return s;
}

export function previewUrl(token: string): string {
  return `https://www.personalsonggifts.com/preview/${token}?followup=true`;
}

export function jitterHours(leadId: string, maxHours: number): number {
  let sum = 0;
  for (let i = 0; i < leadId.length; i++) sum += leadId.charCodeAt(i);
  const minutes = sum % (maxHours * 60);
  return minutes / 60;
}

export function inSendWindow(timezone: string | null | undefined, now: Date): boolean {
  let tz = timezone && timezone.trim() ? timezone.trim() : "America/New_York";
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
      weekday: "short",
    }).formatToParts(now);
  } catch (_e) {
    tz = "America/New_York";
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
      weekday: "short",
    }).formatToParts(now);
  }

  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = parseInt(hourStr, 10) % 24;

  if (weekday === "Sun") return false;
  return hour >= 9 && hour < 19;
}

export interface FollowupEmailArgs {
  firstName: string;
  recipientName: string;
  quote: string | null;
  url: string;
  unsubscribeUrl: string;
  email: string;
  revisionUrl?: string | null;
}

export interface FollowupEmail {
  subject: string;
  textContent: string;
  htmlContent: string;
}

const P = `style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 16px 0;"`;
const P_LINK = `style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 24px 0;"`;
const P_SIGN = `style="color:#333333;font-size:16px;line-height:1.6;margin:0 0 40px 0;"`;

function wrapHtml(bodyParagraphs: string, unsubscribeUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
${bodyParagraphs}
<hr style="border:none;border-top:1px solid #eeeeee;margin:0 0 20px 0;">
<p style="color:#999999;font-size:12px;margin:0 0 6px 0;">Personal Song Gifts &bull; 2108 N ST STE N, SACRAMENTO, CA 95816</p>
<p style="color:#999999;font-size:12px;margin:0;"><a href="${unsubscribeUrl}" style="color:#999999;">Unsubscribe</a></p>
</div></body></html>`;
}

export function buildFollowupEmail2(args: FollowupEmailArgs): FollowupEmail {
  const { firstName, recipientName, quote, url, unsubscribeUrl, revisionUrl } = args;
  const fn = escapeHtml(firstName);
  const rn = escapeHtml(recipientName);

  const openingText = quote
    ? `When you asked us to write ${recipientName}'s song, you told us:

"${quote}"

We put that in the song. It's finished — and ${recipientName} still hasn't heard it.`
    : `You wrote some really personal things for ${recipientName}'s song, and they're all in there. The song is finished — and ${recipientName} still hasn't heard it.`;

  const revisionText = revisionUrl
    ? `Not the right sound? Change the style for free: ${revisionUrl} — or just reply and tell me what to change. A real person reads these.`
    : "If something felt off about the preview, just reply and tell me what to change. A real person reads these.";

  const textContent = `Hi ${firstName},

${openingText}

Your ${followupDiscountPhrase()} is still on this link:
${url}

${revisionText}

— Sara at Personal Song Gifts`

---
Personal Song Gifts
2108 N ST STE N, SACRAMENTO, CA 95816

To unsubscribe: ${unsubscribeUrl}`;

  const openingHtml = quote
    ? `<p ${P}>When you asked us to write ${rn}'s song, you told us:</p>
<p ${P}>"${escapeHtml(quote)}"</p>
<p ${P}>We put that in the song. It's finished — and ${rn} still hasn't heard it.</p>`
    : `<p ${P}>You wrote some really personal things for ${rn}'s song, and they're all in there. The song is finished — and ${rn} still hasn't heard it.</p>`;

  const revisionHtml = revisionUrl
    ? `<p ${P}>Not the right sound? Change the style for free: <a href="${revisionUrl}" style="color:#1E3A5F;">${revisionUrl}</a> — or just reply and tell me what to change. A real person reads these.</p>`
    : `<p ${P}>If something felt off about the preview, just reply and tell me what to change. A real person reads these.</p>`;

  const htmlContent = wrapHtml(
    `<p ${P}>Hi ${fn},</p>
${openingHtml}
<p ${P}>Your ${followupDiscountPhrase()} is still on this link:</p>
<p ${P_LINK}><a href="${url}" style="color:#1E3A5F;">${url}</a></p>
${revisionHtml}
<p ${P_SIGN}>— Sara at Personal Song Gifts</p>`, 
    unsubscribeUrl,
  );

  return { subject: `About ${recipientName}'s song`, textContent, htmlContent };
}

export function buildFollowupEmail3(args: FollowupEmailArgs): FollowupEmail {
  const { firstName, recipientName, url, unsubscribeUrl, revisionUrl } = args;
  const fn = escapeHtml(firstName);
  const rn = escapeHtml(recipientName);

  const revisionText = revisionUrl
    ? `And if the style was never quite right, you can change it for free: ${revisionUrl}`
    : "";

  const textContent = `Hi ${firstName},

This is the last email we'll send about ${recipientName}'s song — we don't believe in pestering people.

The song stays saved on your private link, and the ${followupDiscountPhrase().split(" (")[0]} stays with it:
${url}
${revisionText ? `\n${revisionText}` : ""}

If you ever want it — next birthday, next anniversary, or just a random Tuesday — it'll be here.

Thanks for letting us write about someone you love.

— Sara at Personal Song Gifts

---
Personal Song Gifts
2108 N ST STE N, SACRAMENTO, CA 95816

To unsubscribe: ${unsubscribeUrl}`;

  const revisionHtml = revisionUrl
    ? `<p ${P}>And if the style was never quite right, you can change it for free: <a href="${revisionUrl}" style="color:#1E3A5F;">${revisionUrl}</a></p>`
    : "";

  const htmlContent = wrapHtml(
    `<p ${P}>Hi ${fn},</p>
<p ${P}>This is the last email we'll send about ${rn}'s song — we don't believe in pestering people.</p>
<p ${P}>The song stays saved on your private link, and the ${followupDiscountPhrase().split(" (")[0]} stays with it:</p>
<p ${P_LINK}><a href="${url}" style="color:#1E3A5F;">${url}</a></p>
${revisionHtml}
<p ${P}>If you ever want it — next birthday, next anniversary, or just a random Tuesday — it'll be here.</p>
<p ${P}>Thanks for letting us write about someone you love.</p>
<p ${P_SIGN}>— Sara at Personal Song Gifts</p>`,
    unsubscribeUrl,
  );

  return { subject: `Last note about ${recipientName}'s song`, textContent, htmlContent };
}
