import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

const WEBHOOK_BASE = "https://kjyhxodusvodkknmgmra.supabase.co/functions/v1/brevo-events";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    const provided = req.headers.get("x-admin-password");
    const passwordOk = !!adminPassword && !!provided && provided.trim() === adminPassword.trim();

    let tokenOk = false;
    const registerToken = req.headers.get("x-register-token");
    if (!passwordOk && registerToken && registerToken.trim() !== "") {
      const { data: tokenRow } = await supabase
        .from("admin_settings")
        .select("value")
        .eq("key", "brevo_register_token")
        .maybeSingle();

      const storedToken = (tokenRow as { value: string } | null)?.value?.trim();
      if (storedToken && storedToken === registerToken.trim()) {
        tokenOk = true;
        // Single-use: burn the token immediately before anything else
        await supabase.from("admin_settings").delete().eq("key", "brevo_register_token");
        console.log("[REGISTER-BREVO-WEBHOOK] Single-use register token consumed");
      }
    }

    if (!passwordOk && !tokenOk) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    if (!brevoApiKey) {
      throw new Error("BREVO_API_KEY not configured");
    }

    // Reuse the existing secret if present so the webhook URL stays stable
    const { data: existingSecretRow } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "brevo_webhook_secret")
      .maybeSingle();

    const existingSecret = (existingSecretRow as { value: string } | null)?.value?.trim();

    let secret: string;
    if (existingSecret) {
      secret = existingSecret;
    } else {
      // Generate a random 32-hex secret
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      secret = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

      const { error: settingsError } = await supabase
        .from("admin_settings")
        .upsert({ key: "brevo_webhook_secret", value: secret, updated_at: new Date().toISOString() });

      if (settingsError) {
        throw settingsError;
      }
    }

    const webhookUrl = `${WEBHOOK_BASE}?secret=${secret}`;

    const response = await fetch("https://api.brevo.com/v3/webhooks", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "api-key": brevoApiKey,
      },
      body: JSON.stringify({
        url: webhookUrl,
        events: ["hardBounce", "spam", "unsubscribed", "blocked", "invalid"],
        type: "transactional",
        description: "PSG suppression sync",
      }),
    });

    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch (_) {
      body = { raw: text };
    }

    if (!response.ok) {
      const isDuplicate = response.status === 400 && /exist/i.test(text);
      console.error(`[REGISTER-BREVO-WEBHOOK] Brevo responded ${response.status}: ${text}`);
      if (!isDuplicate) {
        return new Response(
          JSON.stringify({ error: "Brevo request failed", status: response.status, details: body }),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: true, duplicate: true, webhookUrl, brevo: body }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[REGISTER-BREVO-WEBHOOK] Webhook registered");

    return new Response(
      JSON.stringify({ success: true, webhookUrl, brevo: body }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[REGISTER-BREVO-WEBHOOK] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
