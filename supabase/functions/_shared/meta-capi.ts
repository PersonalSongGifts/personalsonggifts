/**
 * Meta Conversions API (server-side) helper.
 *
 * Fire-and-forget by design: this function NEVER throws and NEVER rejects.
 * Safe to deploy before META_CAPI_ACCESS_TOKEN exists (it just logs and returns).
 *
 * Dedupe contract: Meta dedupes on (event_name, event_id). The frontend fires
 * Meta Purchase with eventID `purchase_${orderId}` — server calls MUST use the
 * exact same event_id so the conversion is counted once.
 */

const META_PIXEL_ID = "1231290262288040";
const META_API_VERSION = "v21.0";
const EVENT_SOURCE_URL = "https://www.personalsonggifts.com/payment-success";

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sendMetaPurchase(opts: {
  eventName?: string;
  eventId: string;
  email?: string | null;
  phone?: string | null;
  value: number;
  currency?: string;
  orderId?: string;
  contentName?: string;
}): Promise<void> {
  try {
    const token = Deno.env.get("META_CAPI_ACCESS_TOKEN");
    if (!token) {
      console.log("[META-CAPI] Skipped (no META_CAPI_ACCESS_TOKEN)");
      return;
    }

    const eventName = opts.eventName || "Purchase";
    const currency = opts.currency || "USD";

    const user_data: Record<string, string[]> = {};
    if (opts.email) user_data.em = [await sha256(opts.email)];
    if (opts.phone) user_data.ph = [await sha256(opts.phone)];

    const custom_data: Record<string, unknown> = {
      value: opts.value,
      currency,
    };
    if (opts.orderId) custom_data.order_id = opts.orderId;
    if (opts.contentName) custom_data.content_name = opts.contentName;

    const payload = {
      data: [{
        event_name: eventName,
        event_id: opts.eventId,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: EVENT_SOURCE_URL,
        user_data,
        custom_data,
      }],
    };

    const res = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      console.error(`[META-CAPI] ${eventName} ${opts.eventId} failed: ${res.status} ${text}`);
      return;
    }
    console.log(`[META-CAPI] ${eventName} ${opts.eventId} sent (status ${res.status})`);
  } catch (err) {
    console.error("[META-CAPI]", err);
    return;
  }
}
