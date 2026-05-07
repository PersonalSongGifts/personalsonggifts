// One-shot backfill: bulk imports eligible historical leads to Brevo "All Leads"
// list. Skips converted, dismissed, low-quality, and suppressed.
// POST { dryRun?: boolean, limit?: number, offset?: number }
import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BREVO_API = "https://api.brevo.com/v3";
const ALL_LEADS_LIST_NAME = "All Leads – Personal Song Gifts";
const FOLDER_NAME = "Personal Song Gifts";
const IMPORT_CHUNK_SIZE = 5000;

async function brevoFetch(apiKey: string, path: string, init: RequestInit = {}) {
  return await fetch(`${BREVO_API}${path}`, {
    ...init,
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      "accept": "application/json",
      ...(init.headers || {}),
    },
  });
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

async function getOrCreateAllLeadsList(apiKey: string, supabase: any): Promise<number> {
  const { data: setting } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "brevo_all_leads_list_id")
    .maybeSingle();
  if (setting?.value) return Number(setting.value);

  const folderId = await getOrCreateFolder(apiKey, supabase);
  const res = await brevoFetch(apiKey, "/contacts/lists", {
    method: "POST",
    body: JSON.stringify({ name: ALL_LEADS_LIST_NAME, folderId }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`List create failed: ${JSON.stringify(j)}`);
  await supabase.from("admin_settings").upsert({ key: "brevo_all_leads_list_id", value: String(j.id) });
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
    });
  }
  await supabase.from("admin_settings").upsert({
    key: "brevo_attributes_initialized",
    value: "true",
  });
}

function csvValue(value: unknown): string {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(leads: any[]): string {
  const header = [
    "EMAIL",
    "FIRSTNAME",
    "RECIPIENT_NAME",
    "OCCASION",
    "GENRE",
    "RECIPIENT_TYPE",
    "QUALITY_SCORE",
    "HAS_PREVIEW",
    "UTM_SOURCE",
    "PREVIEW_URL",
    "CAPTURED_AT",
  ].join(";");

  const rows = leads.map((lead) => {
    const previewUrl = lead.preview_token
      ? `https://www.personalsonggifts.com/preview/${lead.preview_token}`
      : "";
    return [
      lead.email?.toLowerCase().trim(),
      lead.customer_name,
      lead.recipient_name,
      lead.occasion,
      lead.genre,
      lead.recipient_type,
      lead.quality_score ?? 0,
      !!lead.preview_song_url || !!lead.full_song_url ? "true" : "false",
      lead.utm_source,
      previewUrl,
      lead.captured_at ? String(lead.captured_at).slice(0, 10) : "",
    ].map(csvValue).join(";");
  });

  return [header, ...rows].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("BREVO_API_KEY");
    if (!apiKey) throw new Error("BREVO_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body.dryRun;
    const limit = Math.min(Number(body.limit) || 25000, 50000);
    const offset = Math.max(Number(body.offset) || 0, 0);

    await ensureAttributes(apiKey, supabase);
    const allLeadsListId = await getOrCreateAllLeadsList(apiKey, supabase);

    // Page through eligible leads
    const pageSize = 1000;
    let from = offset;
    let collected = 0, skipped = 0, errors = 0;
    const errorSamples: string[] = [];
    const deduped = new Map<string, any>();

    while (collected + skipped < limit) {
      const { data: leads, error } = await supabase
        .from("leads")
        .select("*")
        .neq("status", "converted")
        .is("order_id", null)
        .is("dismissed_at", null)
        .gte("quality_score", 20)
        .order("captured_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!leads?.length) break;

      for (const lead of leads) {
        const email = lead.email?.toLowerCase().trim();
        if (!email) {
          skipped++;
          continue;
        }
        deduped.set(email, lead);
        collected++;
        if (collected >= limit) break;
      }

      from += pageSize;
      if (leads.length < pageSize) break;
    }

    const leadsToImport = [...deduped.values()];
    const importJobs: unknown[] = [];

    if (!dryRun) {
      for (let i = 0; i < leadsToImport.length; i += IMPORT_CHUNK_SIZE) {
        const chunk = leadsToImport.slice(i, i + IMPORT_CHUNK_SIZE);
        const res = await brevoFetch(apiKey, "/contacts/import", {
          method: "POST",
          body: JSON.stringify({
            fileBody: buildCsv(chunk),
            listIds: [allLeadsListId],
            updateExistingContacts: true,
            emptyContactsAttributes: false,
            emailBlacklist: false,
            smsBlacklist: false,
          }),
        });
        const txt = await res.text();
        let parsed: unknown = txt;
        try { parsed = JSON.parse(txt); } catch (_) {}
        if (!res.ok) {
          errors++;
          if (errorSamples.length < 5) errorSamples.push(`chunk ${i / IMPORT_CHUNK_SIZE + 1}: ${txt}`);
        } else {
          importJobs.push(parsed);
        }
      }
    }

    console.log(`[BREVO-BACKFILL] Submitted=${leadsToImport.length} Skipped=${skipped} Errors=${errors}`);
    return new Response(
      JSON.stringify({
        success: true,
        dryRun,
        allLeadsListId,
        eligibleFetched: collected,
        submitted: dryRun ? 0 : leadsToImport.length,
        uniqueEmails: leadsToImport.length,
        skipped,
        errors,
        importJobs,
        errorSamples,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[BREVO-BACKFILL] Error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});