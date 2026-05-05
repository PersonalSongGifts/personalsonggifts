// Cron job: removes contacts from "New Leads (last 30 min)" Brevo list when
// their captured_at is older than 30 minutes. Runs every 5 min.
import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BREVO_API = "https://api.brevo.com/v3";
const NEW_LEAD_WINDOW_MIN = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("BREVO_API_KEY");
    if (!apiKey) throw new Error("BREVO_API_KEY not configured");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: setting } = await supabase
      .from("admin_settings").select("value").eq("key", "brevo_new_leads_list_id").maybeSingle();
    const listId = setting?.value ? Number(setting.value) : null;
    if (!listId) {
      return new Response(JSON.stringify({ success: true, skipped: "no_list_yet" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find leads captured between 30 min and 24 hours ago that we may still
    // need to evict. (Older than 24h is unlikely to still be in the list and
    // would have been pruned already.)
    const cutoff = new Date(Date.now() - NEW_LEAD_WINDOW_MIN * 60 * 1000).toISOString();
    const lookback = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: stale } = await supabase
      .from("leads")
      .select("email")
      .lt("captured_at", cutoff)
      .gte("captured_at", lookback)
      .limit(500);

    if (!stale?.length) {
      return new Response(JSON.stringify({ success: true, removed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Brevo: max 150 emails per remove call
    const emails = Array.from(new Set(stale.map((l: any) => l.email.toLowerCase().trim())));
    let removed = 0;
    for (let i = 0; i < emails.length; i += 150) {
      const batch = emails.slice(i, i + 150);
      const res = await fetch(`${BREVO_API}/contacts/lists/${listId}/contacts/remove`, {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({ emails: batch }),
      });
      if (res.ok) removed += batch.length;
    }

    console.log(`[BREVO-PRUNE] Evicted ${removed} stale leads from New Leads list`);
    return new Response(JSON.stringify({ success: true, removed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[BREVO-PRUNE] Error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});