// One-shot: add specific emails to both Brevo lead lists.
// POST { emails: string[] }
import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BREVO_API = "https://api.brevo.com/v3";

async function getListId(supabase: any, key: string): Promise<number | null> {
  const { data } = await supabase
    .from("admin_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ? Number(data.value) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("BREVO_API_KEY");
    if (!apiKey) throw new Error("BREVO_API_KEY not configured");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { emails } = await req.json();
    if (!Array.isArray(emails) || !emails.length) throw new Error("emails[] required");

    const allId = await getListId(supabase, "brevo_all_leads_list_id");
    const newId = await getListId(supabase, "brevo_new_leads_list_id");
    if (!allId || !newId) throw new Error("Brevo lists not initialized");

    const results: any[] = [];
    for (const raw of emails) {
      const email = String(raw).toLowerCase().trim();
      // Upsert contact
      const upsert = await fetch(`${BREVO_API}/contacts`, {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          email,
          updateEnabled: true,
          listIds: [allId, newId],
          emailBlacklisted: false,
        }),
      });
      const upsertText = await upsert.text();
      // Force-add to both lists in case contact existed but wasn't in lists
      const addedTo: number[] = [];
      for (const listId of [allId, newId]) {
        const r = await fetch(`${BREVO_API}/contacts/lists/${listId}/contacts/add`, {
          method: "POST",
          headers: { "api-key": apiKey, "content-type": "application/json" },
          body: JSON.stringify({ emails: [email] }),
        });
        if (r.ok) addedTo.push(listId);
      }
      results.push({ email, upsertStatus: upsert.status, upsertBody: upsertText.slice(0, 200), addedTo });
    }

    return new Response(JSON.stringify({ success: true, allId, newId, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});