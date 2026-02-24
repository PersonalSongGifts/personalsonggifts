const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TIKTOK_PIXEL_ID = "D6F0ED3C77U0SFL8LB60";
const TIKTOK_EVENTS_API_URL = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get("TIKTOK_EVENTS_API_TOKEN");
    if (!accessToken) {
      console.error("[TIKTOK] Missing TIKTOK_EVENTS_API_TOKEN");
      return new Response(
        JSON.stringify({ error: "TikTok Events API token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      event: eventName,
      email,
      phone,
      orderId,
      value,
      currency = "USD",
      contentType = "product",
      contentId,
    } = await req.json();

    if (!eventName) {
      return new Response(
        JSON.stringify({ error: "event is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build user object with hashed PII
    const user: Record<string, string> = {};
    if (email) user.email = await sha256(email);
    if (phone) user.phone = await sha256(phone);

    // Build properties
    const properties: Record<string, unknown> = {};
    if (value !== undefined) properties.value = value;
    if (currency) properties.currency = currency;
    if (contentType) properties.content_type = contentType;
    if (contentId) properties.content_id = contentId;
    if (orderId) properties.order_id = orderId;

    const payload = {
      event_source: "web",
      event_source_id: TIKTOK_PIXEL_ID,
      data: [{
        event: eventName,
        event_id: orderId || crypto.randomUUID(),
        event_time: Math.floor(Date.now() / 1000),
        user: {
          email: user.email ? [user.email] : undefined,
          phone: user.phone ? [user.phone] : undefined,
        },
        properties,
      }],
    };

    console.log(`[TIKTOK] Sending server event: ${eventName}`);

    const response = await fetch(TIKTOK_EVENTS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": accessToken,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log(`[TIKTOK] API response:`, JSON.stringify(result));

    return new Response(
      JSON.stringify({ success: true, tiktok_response: result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[TIKTOK] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
