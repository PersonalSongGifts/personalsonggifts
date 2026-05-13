import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function pstDateString(iso: string): string {
  // YYYY-MM-DD in America/Los_Angeles
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(iso));
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const adminPassword = req.headers.get("x-admin-password");
  if (!adminPassword || adminPassword !== Deno.env.get("ADMIN_PASSWORD")) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const windowDays: number | null =
      body.windowDays === null || body.windowDays === undefined
        ? 30
        : Number(body.windowDays);
    const format: "json" | "csv" = body.format === "csv" ? "csv" : "json";
    const tippersLimit = Math.min(500, Math.max(1, Number(body.tippersLimit) || 100));
    const tippersOffset = Math.max(0, Number(body.tippersOffset) || 0);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const windowStart =
      windowDays && windowDays > 0
        ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

    // --- Live (paid, non-refunded) tips in window
    let tipsQuery = supabase
      .from("song_tips")
      .select("id, order_id, amount_cents, paid_at, customer_email, stripe_payment_intent_id")
      .eq("status", "paid")
      .is("refunded_at", null)
      .order("paid_at", { ascending: false });
    if (windowStart) tipsQuery = tipsQuery.gte("paid_at", windowStart);

    const { data: tipsAll, error: tipsErr } = await tipsQuery;
    if (tipsErr) throw tipsErr;
    const tips = tipsAll || [];

    // --- Deliveries in window (denominator) — by delivered_at
    let deliveriesQuery = supabase
      .from("orders")
      .select("id, occasion, pricing_tier, delivered_at, customer_name, customer_email, recipient_name")
      .not("delivered_at", "is", null);
    if (windowStart) deliveriesQuery = deliveriesQuery.gte("delivered_at", windowStart);
    const { data: deliveriesAll, error: delErr } = await deliveriesQuery;
    if (delErr) throw delErr;
    const deliveries = deliveriesAll || [];

    // --- Order lookup for tip rows (single fetch, distinct order ids)
    const orderIds = Array.from(new Set(tips.map((t) => t.order_id)));
    let orderMap = new Map<string, { occasion: string; pricing_tier: string; customer_name: string; customer_email: string; recipient_name: string }>();
    if (orderIds.length) {
      const { data: ordersForTips, error: ofErr } = await supabase
        .from("orders")
        .select("id, occasion, pricing_tier, customer_name, customer_email, recipient_name")
        .in("id", orderIds);
      if (ofErr) throw ofErr;
      for (const o of ordersForTips || []) {
        orderMap.set(o.id, {
          occasion: o.occasion || "(unknown)",
          pricing_tier: o.pricing_tier || "(unknown)",
          customer_name: o.customer_name || "",
          customer_email: o.customer_email || "",
          recipient_name: o.recipient_name || "",
        });
      }
    }

    // --- Aggregations
    const sumCents = tips.reduce((s, t) => s + (t.amount_cents || 0), 0);
    const totals = {
      count: tips.length,
      sumCents,
      avgCents: tips.length ? Math.round(sumCents / tips.length) : 0,
      deliveriesInWindow: deliveries.length,
      tipsPerDelivery: deliveries.length ? +(tips.length / deliveries.length).toFixed(4) : 0,
    };

    // Daily PST buckets (revenue + count)
    const dailyMap = new Map<string, { cents: number; count: number }>();
    for (const t of tips) {
      if (!t.paid_at) continue;
      const k = pstDateString(t.paid_at);
      const cur = dailyMap.get(k) || { cents: 0, count: 0 };
      cur.cents += t.amount_cents || 0;
      cur.count += 1;
      dailyMap.set(k, cur);
    }
    const daily = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, cents: v.cents, count: v.count }));

    // Breakdown by occasion + pricing tier
    const buildBreakdown = (key: "occasion" | "pricing_tier") => {
      const map = new Map<string, { deliveries: number; tips: number; cents: number }>();
      for (const d of deliveries) {
        const k = (d as Record<string, string>)[key] || "(unknown)";
        const cur = map.get(k) || { deliveries: 0, tips: 0, cents: 0 };
        cur.deliveries += 1;
        map.set(k, cur);
      }
      for (const t of tips) {
        const o = orderMap.get(t.order_id);
        const k = (o ? (o as Record<string, string>)[key] : "(unknown)") || "(unknown)";
        const cur = map.get(k) || { deliveries: 0, tips: 0, cents: 0 };
        cur.tips += 1;
        cur.cents += t.amount_cents || 0;
        map.set(k, cur);
      }
      return Array.from(map.entries())
        .map(([label, v]) => ({
          label,
          deliveries: v.deliveries,
          tips: v.tips,
          tipsPerDelivery: v.deliveries ? +(v.tips / v.deliveries).toFixed(4) : 0,
          avgCents: v.tips ? Math.round(v.cents / v.tips) : 0,
          sumCents: v.cents,
        }))
        .sort((a, b) => b.tips - a.tips);
    };

    const byOccasion = buildBreakdown("occasion").map((r) => ({
      occasion: r.label, deliveries: r.deliveries, tips: r.tips,
      tipsPerDelivery: r.tipsPerDelivery, avgCents: r.avgCents, sumCents: r.sumCents,
    }));
    const byPricingTier = buildBreakdown("pricing_tier").map((r) => ({
      pricingTier: r.label, deliveries: r.deliveries, tips: r.tips,
      tipsPerDelivery: r.tipsPerDelivery, avgCents: r.avgCents, sumCents: r.sumCents,
    }));

    // Tippers list (already ordered desc by paid_at)
    const enrichedAll = tips.map((t) => {
      const o = orderMap.get(t.order_id);
      return {
        id: t.id,
        paidAt: t.paid_at,
        customerName: o?.customer_name || "",
        customerEmail: t.customer_email || o?.customer_email || "",
        shortOrderId: t.order_id.slice(0, 8).toUpperCase(),
        orderId: t.order_id,
        occasion: o?.occasion || "(unknown)",
        pricingTier: o?.pricing_tier || "(unknown)",
        recipientName: o?.recipient_name || "",
        amountCents: t.amount_cents,
        refundable: !!t.stripe_payment_intent_id,
      };
    });

    if (format === "csv") {
      const header = [
        "paid_at_pst", "customer_name", "customer_email", "order_short_id",
        "occasion", "pricing_tier", "recipient_name", "amount_usd",
      ];
      const rows = enrichedAll.map((r) => [
        r.paidAt
          ? new Intl.DateTimeFormat("en-US", {
              timeZone: "America/Los_Angeles",
              year: "numeric", month: "2-digit", day: "2-digit",
              hour: "2-digit", minute: "2-digit", hour12: false,
            }).format(new Date(r.paidAt))
          : "",
        r.customerName, r.customerEmail, r.shortOrderId,
        r.occasion, r.pricingTier, r.recipientName,
        (r.amountCents / 100).toFixed(2),
      ]);
      const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
      const filenameWindow = windowDays ? `${windowDays}d` : "all";
      return new Response(csv, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="tips-${filenameWindow}.csv"`,
        },
      });
    }

    return json({
      totals,
      daily,
      byOccasion,
      byPricingTier,
      tippers: enrichedAll.slice(tippersOffset, tippersOffset + tippersLimit),
      tippersTotal: enrichedAll.length,
    });
  } catch (e) {
    console.error("admin-tips-stats error:", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});