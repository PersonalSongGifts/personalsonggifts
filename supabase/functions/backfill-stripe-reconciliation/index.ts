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

    const listParams: Record<string, unknown> = { limit };
    if (startingAfter) listParams.starting_after = startingAfter;
    const charges = await stripe.charges.list(listParams as never);

    let charges_scanned = 0;
    let matched_by_order_id = 0;
    let matched_by_email_time = 0;
    let ambiguous = 0;
    let unmatched = 0;
    let country_from_billing_address = 0;
    let country_from_card_fallback = 0;
    let no_country_available = 0;
    let updates = 0;
    let skipped_already_had_country = 0;
    let refunded_charges_seen = 0;
    let disputed_charges_seen = 0;
    const country_breakdown: Record<string, number> = {};
    const sample_matches: Array<Record<string, unknown>> = [];
    const errors: Array<{ charge_id: string; error: string }> = [];

    let next_cursor: string | null = null;

    for (const charge of charges.data) {
      next_cursor = charge.id;
      if (charge.status !== "succeeded" || charge.paid !== true) continue;
      charges_scanned++;

      // --- derive fields
      const billingCountry = charge.billing_details?.address?.country ?? null;
      // deno-lint-ignore no-explicit-any
      const cardCountry = (charge.payment_method_details as any)?.card?.country ?? null;
      let country: string | null = null;
      let country_source: string = "none";
      if (billingCountry) {
        country = billingCountry;
        country_source = "billing_address";
        country_from_billing_address++;
      } else if (cardCountry) {
        country = cardCountry;
        country_source = "card_fallback";
        country_from_card_fallback++;
      } else {
        no_country_available++;
      }

      const refunded_amount = charge.amount_refunded ?? 0;
      if (refunded_amount > 0) refunded_charges_seen++;
      if (charge.disputed === true) disputed_charges_seen++;
      // deno-lint-ignore no-explicit-any
      const presentment_currency =
        (charge as any).presentment_details?.presentment_currency ?? charge.currency;

      // --- match to exactly one order
      let orderId: string | null = null;
      let match_rule: string | null = null;
      let existingCountry: string | null = null;
      const metaOrderId = (charge.metadata?.orderId || "").trim();
      const email = (charge.metadata?.customerEmail ?? charge.billing_details?.email ?? "")
        .toLowerCase()
        .trim();

      try {
        if (metaOrderId) {
          const { data, error } = await supabase
            .from("orders")
            .select("id, billing_country_code")
            .eq("id", metaOrderId)
            .maybeSingle();
          if (error) throw error;
          if (data) {
            orderId = data.id;
            existingCountry = data.billing_country_code ?? null;
            match_rule = "order_id_metadata";
            matched_by_order_id++;
          }
        }

        if (!orderId) {
          if (!email) {
            unmatched++;
            continue;
          }
          const created = charge.created * 1000;
          const from = new Date(created - 180_000).toISOString();
          const to = new Date(created + 180_000).toISOString();
          const { data, error } = await supabase
            .from("orders")
            .select("id, customer_email, billing_country_code")
            .gte("created_at", from)
            .lte("created_at", to);
          if (error) throw error;
          const candidates = (data || []).filter(
            (o) => (o.customer_email || "").toLowerCase().trim() === email,
          );
          if (candidates.length > 1) {
            ambiguous++;
            continue;
          }
          if (candidates.length === 0) {
            unmatched++;
            continue;
          }
          orderId = candidates[0].id;
          existingCountry = candidates[0].billing_country_code ?? null;
          match_rule = "email_time_window";
          matched_by_email_time++;
        }

        if (country) {
          country_breakdown[country] = (country_breakdown[country] || 0) + 1;
        }

        if (sample_matches.length < 10) {
          sample_matches.push({
            charge_id: charge.id,
            order_id: orderId,
            email: email || null,
            country,
            country_source,
            match_rule,
            refunded_amount,
            is_disputed: charge.disputed === true,
            presentment_currency,
          });
        }

        if (!country || existingCountry) {
          if (country && existingCountry) skipped_already_had_country++;
          continue;
        }

        if (apply) {
          const { error: upErr } = await supabase
            .from("orders")
            .update({
              billing_country_code: country,
              billing_country_name: COUNTRY_NAMES[country] ?? country,
            })
            .eq("id", orderId)
            .is("billing_country_code", null);
          if (upErr) throw upErr;
        }
        updates++;
      } catch (e) {
        errors.push({ charge_id: charge.id, error: e instanceof Error ? e.message : "unknown" });
      }
    }

    const result: Record<string, unknown> = {
      dry_run: !apply,
      charges_scanned,
      matched_by_order_id,
      matched_by_email_time,
      ambiguous,
      unmatched,
      country_from_billing_address,
      country_from_card_fallback,
      no_country_available,
      skipped_already_had_country,
      refunded_charges_seen,
      disputed_charges_seen,
      country_breakdown,
      has_more: charges.has_more,
      next_cursor,
      sample_matches,
      errors,
    };
    if (apply) result.did_update = updates;
    else result.would_update = updates;

    return json(result);
  } catch (e) {
    console.error("backfill-stripe-reconciliation error:", e);
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});