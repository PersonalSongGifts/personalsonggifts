import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-monitor-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate monitor key
  const monitorKey = req.headers.get("x-monitor-key");
  const expectedKey = Deno.env.get("MONITOR_API_KEY");
  if (!monitorKey || monitorKey !== expectedKey) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const errors: string[] = [];
  const now = new Date();
  const fortyFiveMinAgo = new Date(now.getTime() - 45 * 60 * 1000).toISOString();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Helper: count query with error handling
  async function safeCount(
    table: "orders" | "leads",
    filterFn: (q: any) => any,
    label: string
  ): Promise<number> {
    try {
      const q = filterFn(supabase.from(table).select("id", { count: "exact", head: true }));
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    } catch (e) {
      errors.push(`${label}/${table}: ${e instanceof Error ? e.message : String(e)}`);
      return -1;
    }
  }

  function sumCounts(a: number, b: number): number {
    if (a === -1 || b === -1) return -1;
    return a + b;
  }

  // 1. stuck_orders
  const stuckOrders = sumCounts(
    await safeCount("orders", (q) =>
      q.in("automation_status", ["lyrics_generating", "audio_generating"])
        .lt("automation_started_at", fortyFiveMinAgo),
      "stuck_orders"
    ),
    await safeCount("leads", (q) =>
      q.in("automation_status", ["lyrics_generating", "audio_generating"])
        .lt("automation_started_at", fortyFiveMinAgo),
      "stuck_orders"
    )
  );

  // 2. failed_generations
  const failedGenerations = sumCounts(
    await safeCount("orders", (q) =>
      q.in("automation_status", ["failed", "permanently_failed"])
        .gte("automation_retry_count", 3),
      "failed_generations"
    ),
    await safeCount("leads", (q) =>
      q.in("automation_status", ["failed", "permanently_failed"])
        .gte("automation_retry_count", 3),
      "failed_generations"
    )
  );

  // 3. rate_limited_jobs
  const rateLimitedJobs = sumCounts(
    await safeCount("orders", (q) =>
      q.eq("automation_status", "rate_limited"),
      "rate_limited_jobs"
    ),
    await safeCount("leads", (q) =>
      q.eq("automation_status", "rate_limited"),
      "rate_limited_jobs"
    )
  );

  // 4. input_edit_conflicts (orders only)
  let inputEditConflicts: number;
  try {
    const { count, error } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("pending_revision", true)
      .in("automation_status", ["lyrics_generating", "audio_generating", "completed"]);
    if (error) throw error;
    inputEditConflicts = count ?? 0;
  } catch (e) {
    errors.push(`input_edit_conflicts: ${e instanceof Error ? e.message : String(e)}`);
    inputEditConflicts = -1;
  }

  // 5. pending_delivery
  const pendingDelivery = sumCounts(
    await safeCount("orders", (q) =>
      q.lt("target_send_at", oneHourFromNow)
        .is("sent_at", null)
        .is("dismissed_at", null),
      "pending_delivery"
    ),
    await safeCount("leads", (q) =>
      q.lt("target_send_at", oneHourFromNow)
        .is("sent_at", null)
        .is("dismissed_at", null),
      "pending_delivery"
    )
  );

  // 6. unconverted_leads_24h (leads only)
  const unconvertedLeads24h = await safeCount("leads", (q) =>
    q.eq("status", "lead")
      .lt("captured_at", twentyFourHoursAgo)
      .is("follow_up_sent_at", null)
      .is("dismissed_at", null),
    "unconverted_leads_24h"
  );

  const response: Record<string, any> = {
    stuck_orders: stuckOrders,
    failed_generations: failedGenerations,
    rate_limited_jobs: rateLimitedJobs,
    input_edit_conflicts: inputEditConflicts,
    pending_delivery: pendingDelivery,
    unconverted_leads_24h: unconvertedLeads24h,
    last_updated: now.toISOString(),
  };

  if (errors.length > 0) {
    response.errors = errors;
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
