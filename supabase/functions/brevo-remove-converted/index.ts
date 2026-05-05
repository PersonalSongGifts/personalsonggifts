// Removes a converted lead from both Brevo lead lists (does NOT delete the
// contact — they may receive transactional/order emails).
// POST { email: string }
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

export async function removeFromBrevoLeadLists(supabase: any, apiKey: string, email: string) {
  const normalized = email.toLowerCase().trim();
  const allId = await getListId(supabase, "brevo_all_leads_list_id");
  const newId = await getListId(supabase, "brevo_new_leads_list_id");
  const removed: number[] = [];
  for (const listId of [allId, newId]) {
    if (!listId) continue;
    const res = await fetch(`${BREVO_API}/contacts/lists/${listId}/contacts/remove`, {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ emails: [normalized] }),
    });
    if (res.ok) removed.push(listId);
  }
  return { removed, email: normalized };
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
    const { email } = await req.json();
    if (!email) throw new Error("email required");
    const result = await removeFromBrevoLeadLists(supabase, apiKey, email);
    console.log("[BREVO-REMOVE]", result);
    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[BREVO-REMOVE] Error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});