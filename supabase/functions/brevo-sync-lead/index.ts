// Syncs a lead to Brevo: upserts contact with attributes, adds to "All Leads"
// and "New Leads" lists, fires "lead_generated" event for automations.
// POST { leadId: string }
import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BREVO_API = "https://api.brevo.com/v3";
const ALL_LEADS_LIST_NAME = "All Leads – Personal Song Gifts";
const NEW_LEADS_LIST_NAME = "New Leads (last 30 min) – Personal Song Gifts";
const FOLDER_NAME = "Personal Song Gifts";

async function brevoFetch(apiKey: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${BREVO_API}${path}`, {
    ...init,
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      "accept": "application/json",
      ...(init.headers || {}),
    },
  });
  return res;
}

async function getOrCreateFolder(apiKey: string, supabase: any): Promise<number> {
  const { data: setting } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "brevo_folder_id")
    .maybeSingle();
  if (setting?.value) return Number(setting.value);

  const res = await brevoFetch(apiKey, "/contacts/folders", {
    method: "POST",
    body: JSON.stringify({ name: FOLDER_NAME }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Folder create failed: ${JSON.stringify(j)}`);
  await supabase.from("admin_settings").upsert({ key: "brevo_folder_id", value: String(j.id) });
  return j.id;
}

async function getOrCreateList(
  apiKey: string,
  supabase: any,
  settingsKey: string,
  listName: string,
  folderId: number,
): Promise<number> {
  const { data: setting } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", settingsKey)
    .maybeSingle();
  if (setting?.value) return Number(setting.value);

  const res = await brevoFetch(apiKey, "/contacts/lists", {
    method: "POST",
    body: JSON.stringify({ name: listName, folderId }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`List create failed: ${JSON.stringify(j)}`);
  await supabase.from("admin_settings").upsert({ key: settingsKey, value: String(j.id) });
  return j.id;
}

async function ensureAttributes(apiKey: string, supabase: any) {
  const { data: setting } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "brevo_attributes_initialized")
    .maybeSingle();
  if (setting?.value === "true") return;

  const attrs: Array<{ name: string; type: "text" | "boolean" | "number" | "date" }> = [
    { name: "RECIPIENT_NAME", type: "text" },
    { name: "OCCASION", type: "text" },
    { name: "GENRE", type: "text" },
    { name: "RECIPIENT_TYPE", type: "text" },
    { name: "QUALITY_SCORE", type: "number" },
    { name: "HAS_PREVIEW", type: "boolean" },
    { name: "UTM_SOURCE", type: "text" },
    { name: "PREVIEW_URL", type: "text" },
    { name: "CAPTURED_AT", type: "date" },
  ];
  for (const a of attrs) {
    await brevoFetch(apiKey, `/contacts/attributes/normal/${a.name}`, {
      method: "POST",
      body: JSON.stringify({ type: a.type }),
    }); // ignore conflicts
  }
  await supabase.from("admin_settings").upsert({
    key: "brevo_attributes_initialized",
    value: "true",
  });
}

export async function syncLeadToBrevo(supabase: any, apiKey: string, lead: any) {
  // Eligibility filters
  if (!lead?.email) throw new Error("Lead has no email");
  if (lead.status === "converted" || lead.order_id) {
    return { skipped: "converted" };
  }
  if (lead.dismissed_at) return { skipped: "dismissed" };
  if ((lead.quality_score ?? 0) < 20) return { skipped: "low_quality" };

  const email = lead.email.toLowerCase().trim();

  // Suppression check
  const { data: sup } = await supabase
    .from("email_suppressions")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (sup) return { skipped: "suppressed" };

  await ensureAttributes(apiKey, supabase);
  const folderId = await getOrCreateFolder(apiKey, supabase);
  const allLeadsListId = await getOrCreateList(
    apiKey, supabase, "brevo_all_leads_list_id", ALL_LEADS_LIST_NAME, folderId,
  );
  const newLeadsListId = await getOrCreateList(
    apiKey, supabase, "brevo_new_leads_list_id", NEW_LEADS_LIST_NAME, folderId,
  );

  const previewUrl = lead.preview_token
    ? `https://www.personalsonggifts.com/preview/${lead.preview_token}`
    : null;

  const attributes: Record<string, unknown> = {
    FIRSTNAME: lead.customer_name || "",
    RECIPIENT_NAME: lead.recipient_name || "",
    OCCASION: lead.occasion || "",
    GENRE: lead.genre || "",
    RECIPIENT_TYPE: lead.recipient_type || "",
    QUALITY_SCORE: lead.quality_score ?? 0,
    HAS_PREVIEW: !!lead.preview_song_url || !!lead.full_song_url,
    UTM_SOURCE: lead.utm_source || "",
    PREVIEW_URL: previewUrl || "",
    CAPTURED_AT: lead.captured_at || new Date().toISOString(),
  };

  // Upsert contact (createContact with updateEnabled)
  const upsertRes = await brevoFetch(apiKey, "/contacts", {
    method: "POST",
    body: JSON.stringify({
      email,
      attributes,
      listIds: [allLeadsListId, newLeadsListId],
      updateEnabled: true,
      emailBlacklisted: false,
    }),
  });
  if (!upsertRes.ok && upsertRes.status !== 204) {
    const txt = await upsertRes.text();
    // 400 "Contact already exist" with updateEnabled=true should be 204; but keep going on soft errors
    if (upsertRes.status >= 500) {
      throw new Error(`Brevo upsert failed [${upsertRes.status}]: ${txt}`);
    }
  }

  // Ensure both lists contain the contact (handles case where contact existed
  // but wasn't in our lists yet — updateEnabled doesn't always re-add to lists).
  for (const listId of [allLeadsListId, newLeadsListId]) {
    await brevoFetch(apiKey, `/contacts/lists/${listId}/contacts/add`, {
      method: "POST",
      body: JSON.stringify({ emails: [email] }),
    }); // ignore "already in list"
  }

  // Fire trackEvent for "lead_generated" (Brevo Automation trigger)
  // Uses the older but stable in-app events endpoint
  await brevoFetch(apiKey, "/events", {
    method: "POST",
    body: JSON.stringify({
      event_name: "lead_generated",
      identifiers: { email_id: email },
      contact_properties: attributes,
      event_properties: {
        lead_id: lead.id,
        occasion: lead.occasion,
        genre: lead.genre,
        recipient_type: lead.recipient_type,
        quality_score: lead.quality_score ?? 0,
        has_preview: !!lead.preview_song_url || !!lead.full_song_url,
        utm_source: lead.utm_source || "",
        utm_medium: lead.utm_medium || "",
        utm_campaign: lead.utm_campaign || "",
      },
    }),
  });

  return { synced: true, email };
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

    const { leadId } = await req.json();
    if (!leadId) throw new Error("leadId required");

    const { data: lead, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .maybeSingle();
    if (error || !lead) throw new Error(`Lead not found: ${leadId}`);

    const result = await syncLeadToBrevo(supabase, apiKey, lead);
    console.log(`[BREVO-SYNC] ${leadId}`, result);
    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[BREVO-SYNC] Error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});