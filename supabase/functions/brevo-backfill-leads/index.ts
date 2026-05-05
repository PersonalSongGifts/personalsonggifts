// One-shot backfill: syncs all eligible historical leads to Brevo "All Leads"
// list. Skips converted, dismissed, low-quality, and suppressed.
// POST { dryRun?: boolean, limit?: number }
import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { syncLeadToBrevo } from "../brevo-sync-lead/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("BREVO_API_KEY");
    if (!apiKey) throw new Error("BREVO_API_KEY not configured");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body.dryRun;
    const limit = Math.min(Number(body.limit) || 5000, 10000);

    // Page through eligible leads
    const pageSize = 250;
    let from = 0;
    let synced = 0, skipped = 0, errors = 0;
    const errorSamples: string[] = [];

    while (synced + skipped < limit) {
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
        if (dryRun) { synced++; continue; }
        try {
          const result = await syncLeadToBrevo(supabase, apiKey, lead);
          if ((result as any).synced) synced++;
          else skipped++;
        } catch (e) {
          errors++;
          if (errorSamples.length < 5) {
            errorSamples.push(`${lead.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        // Throttle ~10 req/sec (3 Brevo calls per lead = ~330ms)
        await new Promise((r) => setTimeout(r, 350));
      }

      from += pageSize;
      if (leads.length < pageSize) break;
    }

    console.log(`[BREVO-BACKFILL] Synced=${synced} Skipped=${skipped} Errors=${errors}`);
    return new Response(
      JSON.stringify({ success: true, dryRun, synced, skipped, errors, errorSamples }),
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