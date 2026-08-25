import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface CodeInfo {
  code: string;
  percent_off: number | null;
  amount_off: number | null;
  currency: string | null;
  active: boolean;
  created: number | null;
  source: "promotion_code" | "coupon" | "db_only";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    if (!adminPassword) throw new Error("ADMIN_PASSWORD not configured");
    const expected = adminPassword.trim();

    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try {
        const parsed = await req.json();
        if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
      } catch { body = {}; }
    }

    const provided =
      (req.headers.get("x-admin-password") ??
        (typeof body.adminPassword === "string" ? (body.adminPassword as string) : null))?.trim() ?? null;

    if (!provided || provided !== expected) {
      return json({ error: "Unauthorized" }, 401);
    }

    const action = typeof body.action === "string" ? body.action : "stats";

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "create") {
      const rawCode = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
      const percentOff = Number(body.percentOff);

      if (!/^[A-Z0-9]{3,24}$/.test(rawCode)) {
        return json({ error: "Code must be 3-24 characters, letters and numbers only." }, 400);
      }
      if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 99) {
        return json({ error: "Percent off must be a whole number between 1 and 99." }, 400);
      }

      // Check for an existing Stripe promotion code with the same value.
      const existing = await stripe.promotionCodes.list({ code: rawCode, limit: 1 });
      if (existing.data.length > 0) {
        return json({ error: `The code ${rawCode} already exists in Stripe. Choose a different code.` }, 409);
      }

      const coupon = await stripe.coupons.create({
        percent_off: percentOff,
        duration: "once",
        name: rawCode,
      });

      // No max_redemptions on purpose: our checkouts price server-side and never attach a
      // Stripe discount object, so Stripe's redemption counter/cap would never be enforced.
      let promo;
      try {
        promo = await stripe.promotionCodes.create({ coupon: coupon.id, code: rawCode });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes("already exists")) {
          return json({ error: `The code ${rawCode} already exists in Stripe. Choose a different code.` }, 409);
        }
        throw e;
      }

      return json({ success: true, code: promo.code, percentOff });
    }

    if (action !== "stats") {
      return json({ error: `Unknown action: ${action}` }, 400);
    }

    // ---- Stripe side ----
    const codeMap = new Map<string, CodeInfo>();

    const promos = await stripe.promotionCodes.list({ limit: 100 });
    for (const p of promos.data) {
      const c = typeof p.coupon === "object" && p.coupon ? p.coupon : null;
      codeMap.set(p.code.toUpperCase(), {
        code: p.code.toUpperCase(),
        percent_off: c?.percent_off ?? null,
        amount_off: c?.amount_off ?? null,
        currency: c?.currency ?? null,
        active: !!p.active,
        created: p.created ?? null,
        source: "promotion_code",
      });
    }

    // Legacy standalone coupons (used directly as codes before promotion codes existed).
    const coupons = await stripe.coupons.list({ limit: 100 });
    for (const c of coupons.data) {
      const key = (c.name || c.id).toUpperCase();
      if (codeMap.has(key)) continue;
      codeMap.set(key, {
        code: key,
        percent_off: c.percent_off ?? null,
        amount_off: c.amount_off ?? null,
        currency: c.currency ?? null,
        active: !!c.valid,
        created: c.created ?? null,
        source: "coupon",
      });
    }

    // ---- DB usage ledger ----
    const usage = new Map<string, { uses: number; revenue_cents: number; last_used_at: string | null }>();
    const pageSize = 1000;
    for (let page = 0; page < 20; page++) {
      const { data, error } = await supabase
        .from("orders")
        .select("promo_code, price_cents, price, created_at")
        .not("promo_code", "is", null)
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const row of data) {
        const key = String(row.promo_code || "").trim().toUpperCase();
        if (!key) continue;
        const cents = row.price_cents ?? (row.price != null ? row.price * 100 : 0);
        const cur = usage.get(key) ?? { uses: 0, revenue_cents: 0, last_used_at: null };
        cur.uses += 1;
        cur.revenue_cents += cents || 0;
        if (!cur.last_used_at || (row.created_at && row.created_at > cur.last_used_at)) {
          cur.last_used_at = row.created_at ?? cur.last_used_at;
        }
        usage.set(key, cur);
      }
      if (data.length < pageSize) break;
    }

    // Any DB code missing from Stripe still shows up, flagged.
    for (const key of usage.keys()) {
      if (!codeMap.has(key)) {
        codeMap.set(key, {
          code: key,
          percent_off: null,
          amount_off: null,
          currency: null,
          active: false,
          created: null,
          source: "db_only",
        });
      }
    }

    const codes = Array.from(codeMap.values()).map((c) => {
      const u = usage.get(c.code) ?? { uses: 0, revenue_cents: 0, last_used_at: null };
      return {
        ...c,
        not_in_stripe: c.source === "db_only",
        uses: u.uses,
        revenue_cents: u.revenue_cents,
        last_used_at: u.last_used_at,
      };
    }).sort((a, b) => b.uses - a.uses || a.code.localeCompare(b.code));

    return json({ codes, usage: Object.fromEntries(usage) });
  } catch (error) {
    console.error("admin-promo-codes error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return json({ error: message }, 500);
  }
});
