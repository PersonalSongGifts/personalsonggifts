/**
 * STAGED DRAFT — INERT.
 * At launch: supabase/functions/reconcile-paypal-lead-attempts/index.ts
 *
 * Recovers attempts that no browser came back for: approved-but-not-captured,
 * captured-but-not-finalized, and finalize_failed. Requires MONITOR_API_KEY;
 * no browser and no return secret involved. NOT gated on the creation flag.
 *
 * NO CRON IS INSTALLED by this draft. Scheduling design is in README §Recovery.
 */

import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { finalizeLeadPayPalAttempt, type AttemptRow } from "../_shared/lead-paypal-finalize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-monitor-key",
};

const PAYPAL_API = "https://api-m.paypal.com";
const MIN_AGE_MINUTES = 10;
const MAX_PER_RUN = 25;

async function getAccessToken(): Promise<string> {
  const auth = btoa(`${Deno.env.get("PAYPAL_CLIENT_ID")}:${Deno.env.get("PAYPAL_SECRET_KEY")}`);
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("PayPal auth failed");
  return (await res.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const key = req.headers.get("x-monitor-key");
  if (!key || key !== Deno.env.get("MONITOR_API_KEY")) return json({ error: "unauthorized" }, 401);

  const { dryRun } = await req.json().catch(() => ({ dryRun: true }));
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const cutoff = new Date(Date.now() - MIN_AGE_MINUTES * 60 * 1000).toISOString();
  const { data: attempts, error } = await supabase
    .from("paypal_lead_attempts")
    .select("id, lead_id, provider_order_id, provider_capture_id, base_cents, package_cents, total_cents, status, return_secret_hash")
    .in("status", ["approval_pending", "captured"])
    .not("provider_order_id", "is", null)
    .lt("updated_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(MAX_PER_RUN);

  if (error) return json({ error: error.message }, 500);

  if (dryRun !== false) {
    return json({
      dryRun: true,
      candidates: (attempts ?? []).length,
      ids: (attempts ?? []).slice(0, 5).map((a) => a.id),
    }, 200);
  }

  const accessToken = await getAccessToken();
  const payeeMerchantId = Deno.env.get("PAYPAL_PAYEE_MERCHANT_ID") ?? null;
  const tally: Record<string, number> = {};

  for (const attempt of attempts ?? []) {
    const result = await finalizeLeadPayPalAttempt(supabase, attempt as AttemptRow, {
      requireSecret: false, // authenticated by MONITOR_API_KEY, no browser present
      accessToken,
      payeeMerchantId,
    });
    tally[result.kind] = (tally[result.kind] ?? 0) + 1;
  }

  return json({ dryRun: false, processed: (attempts ?? []).length, tally }, 200);
});
