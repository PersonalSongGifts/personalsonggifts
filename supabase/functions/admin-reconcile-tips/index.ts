import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { logActivity } from "../_shared/activity-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const adminPassword = req.headers.get("x-admin-password");
  if (!adminPassword || adminPassword !== Deno.env.get("ADMIN_PASSWORD")) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Look back 30 days for any pending tips
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: pendingTips, error } = await supabase
      .from("song_tips")
      .select("id, order_id, stripe_session_id, created_at")
      .eq("status", "pending")
      .gte("created_at", cutoff);
    if (error) throw error;

    const results: Array<{ tipId: string; sessionId: string; outcome: string }> = [];

    for (const tip of pendingTips || []) {
      if (!tip.stripe_session_id) {
        results.push({ tipId: tip.id, sessionId: "", outcome: "no_session" });
        continue;
      }
      try {
        const session = await stripe.checkout.sessions.retrieve(tip.stripe_session_id);
        if (session.payment_status !== "paid") {
          results.push({ tipId: tip.id, sessionId: tip.stripe_session_id, outcome: `skip_${session.payment_status}` });
          continue;
        }

        const amountCents = session.amount_total ?? 0;
        const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : null;
        const customerEmail = session.customer_details?.email ?? null;

        const { data: updated, error: upErr } = await supabase
          .from("song_tips")
          .update({
            status: "paid",
            amount_cents: amountCents,
            stripe_payment_intent_id: paymentIntent,
            customer_email: customerEmail,
            paid_at: new Date().toISOString(),
          })
          .eq("id", tip.id)
          .eq("status", "pending")
          .select("id");

        if (upErr) {
          results.push({ tipId: tip.id, sessionId: tip.stripe_session_id, outcome: `db_error:${upErr.message}` });
          continue;
        }
        if (updated && updated.length > 0) {
          await logActivity(
            supabase,
            "order",
            tip.order_id,
            "tip_received",
            "system",
            `Tip of $${(amountCents / 100).toFixed(2)} received (reconciled)`,
          );
          results.push({ tipId: tip.id, sessionId: tip.stripe_session_id, outcome: "marked_paid" });
        } else {
          results.push({ tipId: tip.id, sessionId: tip.stripe_session_id, outcome: "noop" });
        }
      } catch (e) {
        results.push({
          tipId: tip.id,
          sessionId: tip.stripe_session_id,
          outcome: `stripe_error:${e instanceof Error ? e.message : "unknown"}`,
        });
      }
    }

    return json({
      checked: pendingTips?.length || 0,
      reconciled: results.filter((r) => r.outcome === "marked_paid").length,
      results,
    });
  } catch (e) {
    console.error("admin-reconcile-tips error:", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});