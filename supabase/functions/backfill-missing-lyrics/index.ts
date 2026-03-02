import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    if (!adminPassword) throw new Error("ADMIN_PASSWORD not configured");

    const { password } = await req.json();
    if (!password || password.trim() !== adminPassword.trim()) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find orders with audio but no lyrics
    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select("id")
      .not("song_url", "is", null)
      .is("automation_lyrics", null)
      .limit(100);

    if (ordersErr) {
      console.error("Orders query error:", ordersErr);
      throw new Error(`Orders query failed: ${ordersErr.message}`);
    }

    // Find leads with audio but no lyrics
    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("id")
      .not("full_song_url", "is", null)
      .is("automation_lyrics", null)
      .limit(100);

    if (leadsErr) {
      console.error("Leads query error:", leadsErr);
      throw new Error(`Leads query failed: ${leadsErr.message}`);
    }

    const results: { type: string; id: string; status: number }[] = [];

    // Process orders
    for (const order of orders || []) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/automation-generate-lyrics`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ orderId: order.id, force: true }),
        });
        results.push({ type: "order", id: order.id, status: resp.status });
        console.log(`[BACKFILL] Order ${order.id}: ${resp.status}`);
      } catch (e) {
        console.error(`[BACKFILL] Order ${order.id} failed:`, e);
        results.push({ type: "order", id: order.id, status: 0 });
      }
      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Process leads
    for (const lead of leads || []) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/automation-generate-lyrics`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ leadId: lead.id, force: true }),
        });
        results.push({ type: "lead", id: lead.id, status: resp.status });
        console.log(`[BACKFILL] Lead ${lead.id}: ${resp.status}`);
      } catch (e) {
        console.error(`[BACKFILL] Lead ${lead.id} failed:`, e);
        results.push({ type: "lead", id: lead.id, status: 0 });
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    const summary = {
      ordersFound: orders?.length || 0,
      leadsFound: leads?.length || 0,
      totalProcessed: results.length,
      results,
    };

    console.log(`[BACKFILL] Complete:`, JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[BACKFILL] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
