import Stripe from "npm:stripe@18.5.0";
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

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", CA: "Canada", GB: "United Kingdom", AU: "Australia",
  NZ: "New Zealand", IE: "Ireland", ZA: "South Africa", NG: "Nigeria",
  KE: "Kenya", GH: "Ghana", JM: "Jamaica", TT: "Trinidad and Tobago",
  PH: "Philippines", IN: "India", PK: "Pakistan", BD: "Bangladesh",
  DE: "Germany", FR: "France", NL: "Netherlands", ES: "Spain", IT: "Italy",
  SE: "Sweden", NO: "Norway", DK: "Denmark", MX: "Mexico", BR: "Brazil",
  AR: "Argentina", JP: "Japan", SG: "Singapore", MY: "Malaysia",
  AE: "United Arab Emirates", SA: "Saudi Arabia", EG: "Egypt",
  ZW: "Zimbabwe", UG: "Uganda", TZ: "Tanzania", CM: "Cameroon",
  CI: "Côte d'Ivoire", SN: "Senegal", PL: "Poland", PT: "Portugal",
  CH: "Switzerland", AT: "Austria", BE: "Belgium", FI: "Finland",
  RO: "Romania", GR: "Greece", TH: "Thailand", VN: "Vietnam",
  ID: "Indonesia", KR: "South Korea", CN: "China", HK: "Hong Kong",
  TW: "Taiwan", IL: "Israel", TR: "Turkey", CL: "Chile",
  CO: "Colombia", PE: "Peru",
  // Added entries
  PR: "Puerto Rico", UA: "Ukraine", CZ: "Czechia", HU: "Hungary",
  BG: "Bulgaria", HR: "Croatia", RS: "Serbia", SK: "Slovakia",
  SI: "Slovenia", EE: "Estonia", LV: "Latvia", LT: "Lithuania",
  LU: "Luxembourg", IS: "Iceland", MT: "Malta", CY: "Cyprus",
  NP: "Nepal", LK: "Sri Lanka", KH: "Cambodia", MM: "Myanmar",
  QA: "Qatar", KW: "Kuwait", BH: "Bahrain", OM: "Oman", JO: "Jordan",
  LB: "Lebanon", MA: "Morocco", DZ: "Algeria", TN: "Tunisia",
  ET: "Ethiopia", RW: "Rwanda", ZM: "Zambia", BW: "Botswana",
  NA: "Namibia", MW: "Malawi", MZ: "Mozambique", AO: "Angola",
  DO: "Dominican Republic", GT: "Guatemala", CR: "Costa Rica",
  PA: "Panama", EC: "Ecuador", UY: "Uruguay", PY: "Paraguay",
  BO: "Bolivia", VE: "Venezuela", BS: "Bahamas", BB: "Barbados",
  GY: "Guyana", BZ: "Belize", FJ: "Fiji", PG: "Papua New Guinea",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const adminPassword = req.headers.get("x-admin-password");
  if (!adminPassword || adminPassword !== Deno.env.get("ADMIN_PASSWORD")) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const apply: boolean = body?.apply === true;
    const limit = Math.min(100, Math.max(1, Number(body?.limit) || 100));
    const startingAfter: string | undefined =
      typeof body?.starting_after === "string" && body.starting_after.length > 0
        ? body.starting_after
        : undefined;

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const listParams: Record<string, unknown> = { limit, status: "complete" };
    if (startingAfter) listParams.starting_after = startingAfter;

    // deno-lint-ignore no-explicit-any
    const page = await stripe.checkout.sessions.list(listParams as any);

    let sessions_scanned = 0;
    let matched = 0;
    let unmatched = 0;
    let ambiguous = 0;
    let no_country_available = 0;
    let skipped_already_had_country = 0;
    let would_update = 0;
    let did_update = 0;
    const country_breakdown: Record<string, number> = {};
    const sample_matches: Array<{ session_id: string; order_id: string; country: string }> = [];
    const errors: Array<{ session_id: string; error: string }> = [];
    const claimedOrderIds = new Set<string>();
    const countedOrderIds = new Set<string>();

    for (const session of page.data) {
      if (session.payment_status !== "paid") continue;
      sessions_scanned++;

      const sessionId = session.id;
      try {
        const rawCountry = session.customer_details?.address?.country ?? null;
        if (!rawCountry) {
          no_country_available++;
          continue;
        }
        const cc = rawCountry.toUpperCase();

        const { data: rows, error: selErr } = await supabase
          .from("orders")
          .select("id, billing_country_code")
          .or(`notes.eq.stripe_session:${sessionId},notes.eq.lead_session:${sessionId}`);

        if (selErr) throw new Error(selErr.message);

        if (!rows || rows.length === 0) {
          unmatched++;
          continue;
        }
        if (rows.length > 1) {
          ambiguous++;
          continue;
        }

        const order = rows[0];
        matched++;
        if (!countedOrderIds.has(order.id)) {
          countedOrderIds.add(order.id);
          country_breakdown[cc] = (country_breakdown[cc] || 0) + 1;
        }
        if (sample_matches.length < 10) {
          sample_matches.push({ session_id: sessionId, order_id: order.id, country: cc });
        }

        if (order.billing_country_code) {
          skipped_already_had_country++;
          continue;
        }

        if (apply) {
          const { data: updated, error: updErr } = await supabase
            .from("orders")
            .update({
              billing_country_code: cc,
              billing_country_name: COUNTRY_NAMES[cc] ?? cc,
              billing_country_source: "checkout_session",
            })
            .eq("id", order.id)
            .is("billing_country_code", null)
            .select("id");
          if (updErr) throw new Error(updErr.message);
          did_update += updated?.length ?? 0;
        } else if (!claimedOrderIds.has(order.id)) {
          claimedOrderIds.add(order.id);
          would_update++;
        }
      } catch (e) {
        errors.push({ session_id: sessionId, error: e instanceof Error ? e.message : String(e) });
        if (errors.length > 5) {
          return json({
            error: "Aborted: too many per-session errors on this page; cursor not advanced",
            dry_run: !apply,
            sessions_scanned,
            errors,
          }, 500);
        }
      }
    }

    const lastSession = page.data[page.data.length - 1];

    return json({
      dry_run: !apply,
      sessions_scanned,
      matched,
      unmatched,
      ambiguous,
      no_country_available,
      skipped_already_had_country,
      ...(apply ? { did_update } : { would_update }),
      country_breakdown,
      has_more: page.has_more,
      next_cursor: page.has_more && lastSession ? lastSession.id : null,
      sample_matches,
      errors,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
