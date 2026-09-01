import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPPRESS_EVENTS = new Set([
  "hard_bounce",
  "hardbounce",
  "spam",
  "complaint",
  "unsubscribed",
  "unsubscribe",
  "blocked",
  "invalid_email",
  "invalidemail",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const providedSecret = url.searchParams.get("secret");

    const { data: secretRow } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "brevo_webhook_secret")
      .maybeSingle();

    const expectedSecret = (secretRow as { value: string } | null)?.value;

    if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
      console.warn("[BREVO-EVENTS] Unauthorized webhook call");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let payload: Record<string, unknown> | null = null;
    try {
      payload = await req.json();
    } catch (_) {
      payload = null;
    }

    const eventRaw = typeof payload?.event === "string" ? payload.event : "";
    const emailRaw = typeof payload?.email === "string" ? payload.email : "";
    const eventKey = eventRaw.toLowerCase().replace(/[\s-]/g, "_");
    const eventKeyCompact = eventKey.replace(/_/g, "");

    if (!emailRaw || !emailRaw.includes("@")) {
      console.log(`[BREVO-EVENTS] No usable email for event "${eventRaw}" — no-op`);
      return new Response(JSON.stringify({ ok: true, action: "noop" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!SUPPRESS_EVENTS.has(eventKey) && !SUPPRESS_EVENTS.has(eventKeyCompact)) {
      console.log(`[BREVO-EVENTS] Ignoring event "${eventRaw}"`);
      return new Response(JSON.stringify({ ok: true, action: "noop" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = emailRaw.toLowerCase().trim();
    const { error } = await supabase
      .from("email_suppressions")
      .upsert({ email }, { onConflict: "email" });

    if (error) {
      console.error("[BREVO-EVENTS] Suppression upsert error:", error);
    } else {
      console.log(`[BREVO-EVENTS] Suppressed ${email} due to "${eventRaw}"`);
    }

    return new Response(JSON.stringify({ ok: true, action: "suppressed" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[BREVO-EVENTS] Handler error:", error);
    return new Response(JSON.stringify({ ok: true, action: "error_logged" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
