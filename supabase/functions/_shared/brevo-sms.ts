/**
 * Shared Brevo SMS helper with timezone-aware quiet hours.
 * 
 * SAFETY: Never throws — always returns a structured result.
 * SMS errors must NEVER block email delivery.
 */

const SMS_SENDER = "SongGifts";
const QUIET_HOUR_START = 21; // 9 PM
const QUIET_HOUR_END = 9;   // 9 AM

export interface SmsRequest {
  to: string;          // E.164 phone number
  text: string;        // SMS body (must include STOP language)
  tag: string;         // "order_delivery" | "lead_preview"
  timezone?: string;   // IANA timezone (e.g. "America/New_York")
}

export interface SmsResult {
  sent: boolean;
  scheduled: boolean;
  scheduledFor?: string;  // ISO timestamp of next 9 AM
  error?: string;
  brevoMessageId?: string;
}

/**
 * Infer timezone from phone country code (basic fallback).
 */
function inferTimezoneFromPhone(phone: string): string {
  if (phone.startsWith("+1")) return "America/New_York";
  if (phone.startsWith("+44")) return "Europe/London";
  if (phone.startsWith("+61")) return "Australia/Sydney";
  if (phone.startsWith("+91")) return "Asia/Kolkata";
  if (phone.startsWith("+49")) return "Europe/Berlin";
  if (phone.startsWith("+33")) return "Europe/Paris";
  if (phone.startsWith("+81")) return "Asia/Tokyo";
  if (phone.startsWith("+86")) return "Asia/Shanghai";
  if (phone.startsWith("+55")) return "America/Sao_Paulo";
  if (phone.startsWith("+52")) return "America/Mexico_City";
  // Default fallback
  return "America/New_York";
}

/**
 * Get the current hour in the recipient's timezone.
 */
function getLocalHour(timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const hourPart = parts.find(p => p.type === "hour");
    return parseInt(hourPart?.value || "12", 10);
  } catch {
    // Invalid timezone, default to noon (safe to send)
    return 12;
  }
}

/**
 * Calculate the next 9 AM in the recipient's timezone.
 */
function getNext9AM(timezone: string): string {
  try {
    const now = new Date();
    
    // Get the current date in the target timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      hour12: false,
    });
    
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
    const month = parts.find(p => p.type === "month")?.value || "01";
    const day = parts.find(p => p.type === "day")?.value || "01";
    const year = parts.find(p => p.type === "year")?.value || "2026";

    // If before 9 AM, schedule for today at 9 AM
    // If after 9 PM, schedule for tomorrow at 9 AM
    let targetDay = parseInt(day, 10);
    if (hour >= QUIET_HOUR_START) {
      targetDay += 1;
    }
    // If hour < 9 (early morning), keep same day

    // Build a date string in the target timezone (approximate)
    // We create the date as if it were UTC, then adjust
    const targetDate = new Date(`${year}-${month}-${String(targetDay).padStart(2, "0")}T09:00:00`);
    
    // Get the UTC offset for the timezone at that time
    const testFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    });
    const tzParts = testFormatter.formatToParts(targetDate);
    const tzName = tzParts.find(p => p.type === "timeZoneName")?.value || "GMT";
    
    // Parse offset like "GMT-5" or "GMT+5:30"
    const offsetMatch = tzName.match(/GMT([+-]?\d+)(?::(\d+))?/);
    let offsetMinutes = 0;
    if (offsetMatch) {
      const hours = parseInt(offsetMatch[1], 10);
      const mins = parseInt(offsetMatch[2] || "0", 10);
      offsetMinutes = hours * 60 + (hours < 0 ? -mins : mins);
    }
    
    // Convert local 9 AM to UTC
    const utcTime = new Date(targetDate.getTime() - offsetMinutes * 60 * 1000);
    return utcTime.toISOString();
  } catch {
    // Fallback: 9 hours from now
    return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();
  }
}

/**
 * Check if the current time is within quiet hours for the given timezone.
 */
function isQuietHours(timezone: string): boolean {
  const localHour = getLocalHour(timezone);
  return localHour >= QUIET_HOUR_START || localHour < QUIET_HOUR_END;
}

/**
 * Send an SMS via Brevo's transactional SMS API.
 * Respects quiet hours (9 PM – 9 AM recipient local time).
 * 
 * NEVER throws — always returns a structured SmsResult.
 */
export async function sendSms(req: SmsRequest): Promise<SmsResult> {
  try {
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    if (!brevoApiKey) {
      console.error("[SMS] BREVO_API_KEY not configured");
      return { sent: false, scheduled: false, error: "BREVO_API_KEY not configured" };
    }

    // Validate phone
    if (!req.to || !/^\+\d{10,15}$/.test(req.to)) {
      return { sent: false, scheduled: false, error: "Invalid phone number" };
    }

    // Determine timezone: explicit > infer from phone > default
    const effectiveTimezone = req.timezone || inferTimezoneFromPhone(req.to);

    // Check quiet hours
    if (isQuietHours(effectiveTimezone)) {
      const scheduledFor = getNext9AM(effectiveTimezone);
      console.log(`[SMS] Quiet hours in ${effectiveTimezone}, scheduling for ${scheduledFor}`);
      return { sent: false, scheduled: true, scheduledFor };
    }

    // Send via Brevo transactional SMS API
    const response = await fetch("https://api.brevo.com/v3/transactionalSMS/send", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "api-key": brevoApiKey,
      },
      body: JSON.stringify({
        sender: SMS_SENDER,
        recipient: req.to,
        content: req.text,
        type: "transactional",
        tag: req.tag,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SMS] Brevo API error (${response.status}):`, errorText);
      return { sent: false, scheduled: false, error: `Brevo API error: ${response.status} - ${errorText.substring(0, 200)}` };
    }

    const result = await response.json();
    console.log(`[SMS] Sent to ${req.to.substring(0, 5)}***:`, result);
    
    return {
      sent: true,
      scheduled: false,
      brevoMessageId: result.messageId || result.reference || null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SMS error";
    console.error("[SMS] Unexpected error:", message);
    return { sent: false, scheduled: false, error: message };
  }
}
