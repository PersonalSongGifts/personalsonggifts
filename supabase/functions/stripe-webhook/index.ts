import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { computeInputsHash } from "../_shared/hash-utils.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { buildLeadFingerprint, buildLeadFingerprintFromInput } from "../_shared/lead-order-matching.ts";
import { buildLeadAssetPatch, shouldDispatchDelivery } from "../_shared/lead-conversion.ts";

function normalizeMatch(v?: string | null): string {
  return (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Timing constants
const STABILIZATION_MINUTES = 5; // Wait before generation starts
const HOURS_BEFORE_EXPECTED_TO_SEND = 12; // Send 12h before expected delivery

function calculateExpectedDelivery(tier: string): string {
  const now = new Date();
  if (tier === "priority") {
    // 24 hours from now
    return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
  // 48 hours from now for standard
  return new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
}

// Compute timing fields for background automation
function computeOrderTiming(expectedDelivery: string): {
  earliestGenerateAt: string;
  targetSendAt: string;
} {
  const now = Date.now();
  const expectedMs = new Date(expectedDelivery).getTime();
  
  // Earliest generation: 5 minutes from now (stabilization window)
  const earliestGenerateAt = new Date(now + STABILIZATION_MINUTES * 60 * 1000).toISOString();
  
  // Target send: 12 hours before expected delivery
  let targetSendMs = expectedMs - HOURS_BEFORE_EXPECTED_TO_SEND * 60 * 60 * 1000;
  
  // If target send is in the past, add 30-minute buffer
  if (targetSendMs <= now) {
    targetSendMs = now + 30 * 60 * 1000;
    console.log(`[WEBHOOK] target_send_at was past, adjusted to ${new Date(targetSendMs).toISOString()}`);
  }
  
  return {
    earliestGenerateAt,
    targetSendAt: new Date(targetSendMs).toISOString(),
  };
}


Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Get the raw body and signature
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      console.error("No stripe-signature header");
      return new Response(
        JSON.stringify({ error: "No signature provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the webhook signature
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Received webhook event: ${event.type}`);

    // --- charge.refunded handler for tips (idempotent) ---
    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id;

      if (paymentIntentId) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        const { data: tip } = await supabase
          .from("song_tips")
          .select("id, order_id, amount_cents, refunded_at")
          .eq("stripe_payment_intent_id", paymentIntentId)
          .maybeSingle();

        if (tip) {
          // Idempotent: COALESCE-style guard so retries / manual->webhook race don't overwrite
          const { error } = await supabase
            .from("song_tips")
            .update({
              refunded_at: tip.refunded_at ?? new Date().toISOString(),
              refunded_by: tip.refunded_at ? undefined : "webhook",
            })
            .eq("id", tip.id);

          if (error) {
            console.error("[WEBHOOK] Failed to mark tip refunded:", error);
          } else if (!tip.refunded_at) {
            await logActivity(
              supabase,
              "order",
              tip.order_id,
              "tip_refunded",
              "system",
              `Tip of $${(tip.amount_cents / 100).toFixed(2)} refunded via Stripe`,
            );
          }

          return new Response(
            JSON.stringify({ received: true, type: "tip_refunded", tipId: tip.id }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      // Not a tip — fall through to "unhandled" acknowledgement
    }

    // Handle checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // Only process if payment was successful
      if (session.payment_status !== "paid") {
        console.log(`Skipping session ${session.id} - payment_status: ${session.payment_status}`);
        return new Response(
          JSON.stringify({ received: true, skipped: "payment not completed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // --- Lyrics Unlock handler (early return before order creation) ---
      const sessionMetadata = session.metadata || {};
      // --- Song Tip handler (canonical: client-side verify-tip is best-effort only) ---
      if (sessionMetadata.entitlement === "song_tip") {
        const tipOrderId = sessionMetadata.orderId;
        console.log(`[WEBHOOK] Song tip for order ${tipOrderId}, session ${session.id}`);

        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        const amountCents = session.amount_total ?? Number(sessionMetadata.amountCents) ?? 0;
        const customerEmail = session.customer_details?.email ?? null;
        const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : null;

        // Idempotent: only flip rows still pending for this session
        const { data: updated, error: tipErr } = await supabase
          .from("song_tips")
          .update({
            status: "paid",
            amount_cents: amountCents,
            stripe_payment_intent_id: paymentIntent,
            customer_email: customerEmail,
            paid_at: new Date().toISOString(),
          })
          .eq("stripe_session_id", session.id)
          .eq("status", "pending")
          .select("id");

        if (tipErr) {
          console.error("[WEBHOOK] Failed to mark tip paid:", tipErr);
        } else if (updated && updated.length > 0 && tipOrderId) {
          await logActivity(
            supabase,
            "order",
            tipOrderId,
            "tip_received",
            "system",
            `Tip of $${(amountCents / 100).toFixed(2)} received (via webhook)`,
          );
        }

        return new Response(
          JSON.stringify({ received: true, type: "song_tip", orderId: tipOrderId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (sessionMetadata.entitlement === "lyrics_unlock") {
        const lyricsOrderId = sessionMetadata.orderId;
        console.log(`[WEBHOOK] Lyrics unlock for order ${lyricsOrderId}`);

        if (!lyricsOrderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lyricsOrderId)) {
          console.error("[WEBHOOK] Invalid orderId in lyrics_unlock metadata");
          return new Response(
            JSON.stringify({ received: true, error: "Invalid orderId in metadata" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Idempotent: only update if lyrics_unlocked_at IS NULL
        const { error: lyricsUpdateError } = await supabase
          .from("orders")
          .update({
            lyrics_unlocked_at: new Date().toISOString(),
            lyrics_unlock_session_id: session.id,
            lyrics_unlock_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
            lyrics_price_cents: session.amount_total,
          })
          .eq("id", lyricsOrderId)
          .is("lyrics_unlocked_at", null);

        if (lyricsUpdateError) {
          console.error("[WEBHOOK] Failed to unlock lyrics:", lyricsUpdateError);
        } else {
          console.log(`[WEBHOOK] Lyrics unlocked for order ${lyricsOrderId}`);
        }

        return new Response(
          JSON.stringify({ received: true, type: "lyrics_unlock", orderId: lyricsOrderId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // --- End Lyrics Unlock handler ---

      // --- Download Unlock handler (early return before order creation) ---
      if (sessionMetadata.entitlement === "download_unlock") {
        const downloadOrderId = sessionMetadata.orderId;
        console.log(`[WEBHOOK] Download unlock for order ${downloadOrderId}`);

        if (!downloadOrderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(downloadOrderId)) {
          console.error("[WEBHOOK] Invalid orderId in download_unlock metadata");
          return new Response(
            JSON.stringify({ received: true, error: "Invalid orderId in metadata" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Idempotent: only update if download_unlocked_at IS NULL
        const { error: downloadUpdateError } = await supabase
          .from("orders")
          .update({
            download_unlocked_at: new Date().toISOString(),
            download_unlock_session_id: session.id,
            download_unlock_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
            download_price_cents: session.amount_total,
          })
          .eq("id", downloadOrderId)
          .is("download_unlocked_at", null);

        if (downloadUpdateError) {
          console.error("[WEBHOOK] Failed to unlock download:", downloadUpdateError);
        } else {
          console.log(`[WEBHOOK] Download unlocked for order ${downloadOrderId}`);
          await logActivity(supabase, "order", downloadOrderId, "download_unlocked", "system", `Download unlocked via Stripe, $${(session.amount_total || 0) / 100}`);
        }

        return new Response(
          JSON.stringify({ received: true, type: "download_unlock", orderId: downloadOrderId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // --- End Download Unlock handler ---

      // --- Bonus Unlock handler (early return before order creation) ---
      if (sessionMetadata.entitlement === "bonus_unlock") {
        const bonusOrderId = sessionMetadata.orderId;
        console.log(`[WEBHOOK] Bonus unlock for order ${bonusOrderId}`);

        if (!bonusOrderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bonusOrderId)) {
          console.error("[WEBHOOK] Invalid orderId in bonus_unlock metadata");
          return new Response(
            JSON.stringify({ received: true, error: "Invalid orderId in metadata" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Idempotent: only update if bonus_unlocked_at IS NULL
        const { error: bonusUpdateError } = await supabase
          .from("orders")
          .update({
            bonus_unlocked_at: new Date().toISOString(),
            bonus_unlock_session_id: session.id,
            bonus_unlock_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
            bonus_price_cents: session.amount_total,
          })
          .eq("id", bonusOrderId)
          .is("bonus_unlocked_at", null);

        if (bonusUpdateError) {
          console.error("[WEBHOOK] Failed to unlock bonus:", bonusUpdateError);
        } else {
          console.log(`[WEBHOOK] Bonus unlocked for order ${bonusOrderId}`);
          await logActivity(supabase, "order", bonusOrderId, "bonus_unlocked", "system", `Bonus unlocked via Stripe webhook, $${(session.amount_total || 0) / 100}`);
        }

        return new Response(
          JSON.stringify({ received: true, type: "bonus_unlock", orderId: bonusOrderId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // --- End Bonus Unlock handler ---

      // --- Package Unlock handler (early return before order creation) ---
      if (sessionMetadata.type === "package_unlock" || sessionMetadata.entitlement === "package_unlock") {
        const packageOrderId = sessionMetadata.orderId;
        console.log(`[WEBHOOK] Package unlock for order ${packageOrderId}`);

        if (!packageOrderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(packageOrderId)) {
          console.error("[WEBHOOK] Invalid orderId in package_unlock metadata");
          return new Response(
            JSON.stringify({ received: true, error: "Invalid orderId in metadata" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const nowIso = new Date().toISOString();
        const amountTotal = session.amount_total ?? 0;
        const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;

        // Idempotent: only update if package_unlocked_at IS NULL
        const { error: packageUpdateError } = await supabase
          .from("orders")
          .update({
            package_unlocked_at: nowIso,
            package_unlock_session_id: session.id,
            package_unlock_payment_intent_id: paymentIntentId,
            package_price_cents: amountTotal,
          })
          .eq("id", packageOrderId)
          .is("package_unlocked_at", null);

        if (packageUpdateError) {
          console.error("[WEBHOOK] Failed to unlock package:", packageUpdateError);
          // Return 500 so Stripe retries — the update is idempotent (.is package_unlocked_at null), so a retry is safe.
          return new Response(
            JSON.stringify({ error: "Failed to unlock package" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.log(`[WEBHOOK] Package unlocked for order ${packageOrderId}`);
        await logActivity(supabase, "order", packageOrderId, "package_unlocked", "system", `Forever Memory Package unlocked via Stripe webhook, $${(amountTotal / 100).toFixed(2)}`);

        // Bundle: unlock each individual entitlement idempotently ($0 because included)
        await supabase
          .from("orders")
          .update({ lyrics_unlocked_at: nowIso, lyrics_price_cents: 0 })
          .eq("id", packageOrderId)
          .is("lyrics_unlocked_at", null);

        await supabase
          .from("orders")
          .update({ download_unlocked_at: nowIso, download_price_cents: 0 })
          .eq("id", packageOrderId)
          .is("download_unlocked_at", null);

        await supabase
          .from("orders")
          .update({ bonus_unlocked_at: nowIso, bonus_price_cents: 0 })
          .eq("id", packageOrderId)
          .is("bonus_unlocked_at", null);

        return new Response(
          JSON.stringify({ received: true, type: "package_unlock", orderId: packageOrderId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // --- End Package Unlock handler ---

      // Initialize Supabase
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Check if order already exists (idempotency)
      const { data: existingOrder } = await supabase
        .from("orders")
        .select("id")
        .eq("notes", `stripe_session:${session.id}`)
        .single();

      if (existingOrder) {
        console.log(`Order already exists for session ${session.id}: ${existingOrder.id}`);
        return new Response(
          JSON.stringify({ received: true, orderId: existingOrder.id, status: "already_exists" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get metadata from the session
      const metadata = session.metadata || {};

      // Handle lead conversion payments server-side (primary handler)
      if (metadata.leadId) {
        console.log(`[WEBHOOK] Lead conversion for lead ${metadata.leadId}, session ${session.id}`);

        // Idempotency check for lead sessions
        const { data: existingLeadOrder } = await supabase
          .from("orders")
          .select("id")
          .eq("notes", `lead_session:${session.id}`)
          .maybeSingle();

        if (existingLeadOrder) {
          console.log(`[WEBHOOK] Lead order already exists for session ${session.id}: ${existingLeadOrder.id}`);
          return new Response(
            JSON.stringify({ received: true, orderId: existingLeadOrder.id, status: "already_exists" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Fetch lead record
        const { data: lead, error: leadFetchError } = await supabase
          .from("leads")
          .select("*")
          .eq("id", metadata.leadId)
          .maybeSingle();

        if (leadFetchError || !lead) {
          console.error(`[WEBHOOK] Lead ${metadata.leadId} not found:`, leadFetchError);
          return new Response(
            JSON.stringify({ error: "Lead not found" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const leadPricingTier = metadata.pricingTier || "standard";
        const leadPriceCents: number = (session.amount_total
          ?? (metadata.offerPriceCents ? parseInt(metadata.offerPriceCents, 10) : NaN))
          || 4999;
        const leadPrice = Math.floor(leadPriceCents / 100);

        const leadNotesValue = `lead_session:${session.id}`;
        if (!/^lead_session:cs_[a-zA-Z0-9_]+$/.test(leadNotesValue)) {
          console.error(`[WEBHOOK] Unexpected lead notes format: ${leadNotesValue}`);
          return new Response(
            JSON.stringify({ error: "Internal error: unexpected session ID format" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Create order with ALL fields from the lead (mirrors process-lead-payment)
        const { data: leadOrder, error: leadInsertError } = await supabase
          .from("orders")
          .insert({
            pricing_tier: leadPricingTier,
            price: leadPrice,
            price_cents: leadPriceCents,
            expected_delivery: new Date().toISOString(),
            customer_name: lead.customer_name,
            customer_email: lead.email,
            customer_phone: lead.phone,
            recipient_type: lead.recipient_type,
            recipient_name: lead.recipient_name,
            recipient_name_pronunciation: lead.recipient_name_pronunciation,
            occasion: lead.occasion,
            genre: lead.genre,
            singer_preference: lead.singer_preference,
            special_qualities: lead.special_qualities,
            favorite_memory: lead.favorite_memory,
            special_message: lead.special_message,
            song_url: lead.full_song_url,
            song_title: lead.song_title,
            cover_image_url: lead.cover_image_url,
            automation_lyrics: lead.automation_lyrics,
            automation_status: lead.full_song_url ? "completed" : (lead.automation_lyrics ? "lyrics_ready" : null),
            lyrics_language_code: lead.lyrics_language_code || "en",
            inputs_hash: lead.inputs_hash,
            phone_e164: lead.phone_e164,
            sms_opt_in: lead.sms_opt_in || false,
            timezone: lead.timezone,
            prev_automation_lyrics: lead.prev_automation_lyrics,
            prev_song_url: lead.prev_song_url,
            prev_cover_image_url: lead.prev_cover_image_url,
            source: "lead_conversion",
            device_type: "Web",
            notes: leadNotesValue,
            status: lead.full_song_url ? "delivered" : "pending",
            delivered_at: lead.full_song_url ? new Date().toISOString() : null,
          })
          .select("id, recipient_name, occasion, genre, pricing_tier, customer_email, song_url, price_cents, revision_token")
          .single();

        // Handle race condition
        if (leadInsertError) {
          if (leadInsertError.code === "23505" || leadInsertError.message?.includes("duplicate")) {
            console.log(`[WEBHOOK] Race condition for lead session ${session.id}`);
            const { data: raceOrder } = await supabase
              .from("orders")
              .select("id")
              .eq("notes", leadNotesValue)
              .maybeSingle();
            if (raceOrder) {
              return new Response(
                JSON.stringify({ received: true, orderId: raceOrder.id, status: "already_exists" }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
          console.error("[WEBHOOK] Lead order creation failed:", leadInsertError);
          return new Response(
            JSON.stringify({ error: "Failed to create lead order" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[WEBHOOK] Lead ${lead.id} converted to order ${leadOrder.id}`);

        // Mark lead as converted
        await supabase
          .from("leads")
          .update({
            status: "converted",
            converted_at: new Date().toISOString(),
            order_id: leadOrder.id,
          })
          .eq("id", lead.id);

        await logActivity(supabase, "lead", lead.id, "lead_converted", "system", `Converted to order ${leadOrder.id.slice(0, 8).toUpperCase()} via webhook`);

        // Remove from Brevo lead lists (fire-and-forget)
        fetch(`${supabaseUrl}/functions/v1/brevo-remove-converted`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({ email: lead.email }),
        }).catch((e) => console.error("[WEBHOOK] Brevo remove failed:", e));
        await logActivity(supabase, "order", leadOrder.id, "order_created", "system", `Created from lead conversion via webhook, $${leadPriceCents / 100}`);

        // Trigger lyrics generation if missing
        if (!lead.automation_lyrics) {
          try {
            const hasAudio = !!lead.full_song_url;
            console.log(`[WEBHOOK] Lyrics missing on lead ${lead.id}, triggering generation for order ${leadOrder.id}`);
            await fetch(`${supabaseUrl}/functions/v1/automation-generate-lyrics`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({ orderId: leadOrder.id, type: "order", ...(hasAudio && { force: true }) }),
            });
          } catch (e) {
            console.error("[WEBHOOK] Failed to trigger lyrics generation:", e);
          }
        }
        // If lead has lyrics but NO full song, kick off audio generation now.
        // Without this, the converted order sits at automation_status='lyrics_ready'
        // forever and the customer never receives a song.
        else if (!lead.full_song_url) {
          try {
            console.log(`[WEBHOOK] Lead ${lead.id} has lyrics but no song — triggering audio for order ${leadOrder.id}`);
            await fetch(`${supabaseUrl}/functions/v1/automation-trigger`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({ orderId: leadOrder.id, skipLyrics: true, forceRun: true }),
            });
          } catch (e) {
            console.error("[WEBHOOK] Failed to trigger audio for lyrics-only lead order:", e);
          }
        }

        // Send delivery email if song exists
        if (lead.full_song_url) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/send-song-delivery`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                orderId: leadOrder.id,
                customerEmail: lead.email,
                customerName: lead.customer_name,
                recipientName: lead.recipient_name,
                occasion: lead.occasion,
                songUrl: lead.full_song_url,
                revisionToken: leadOrder.revision_token,
              }),
            });
            console.log(`[WEBHOOK] Delivery email sent for lead order ${leadOrder.id}`);
          } catch (e) {
            console.error("[WEBHOOK] Failed to send delivery email:", e);
          }
        }

        // Sync to Google Sheets
        try {
          await fetch(`${supabaseUrl}/functions/v1/append-to-sheet`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              orderId: leadOrder.id,
              createdAt: new Date().toISOString(),
              status: lead.full_song_url ? "delivered" : "pending",
              pricingTier: leadPricingTier,
              price: leadPriceCents / 100,
              customerName: lead.customer_name,
              customerEmail: lead.email,
              customerPhone: lead.phone || "",
              recipientName: lead.recipient_name,
              occasion: lead.occasion,
              genre: lead.genre,
              singerPreference: lead.singer_preference,
              specialQualities: lead.special_qualities,
              favoriteMemory: lead.favorite_memory,
              specialMessage: lead.special_message || "",
              deviceType: "Web (Lead Conversion)",
            }),
          });
        } catch (e) {
          console.error("[WEBHOOK] Failed to sync to Google Sheets:", e);
        }

        return new Response(
          JSON.stringify({ received: true, orderId: leadOrder.id, status: "created" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create the order with timing fields for background automation
      const pricingTier = metadata.pricingTier || "standard";

      // Canonical price: session.amount_total (Stripe's actual total charge, cents).
      // Single line item, no tax/shipping. Fallback: metadata -> legacy tier mapping.
      const priceCents: number = (session.amount_total
        ?? (metadata.amount_total_cents ? parseInt(metadata.amount_total_cents, 10) : NaN))
        || (pricingTier === "priority" ? 7999 : 4999);

      const expectedDelivery = calculateExpectedDelivery(pricingTier);

      // Forever Memory Package add-on (checkout-time). Absent → no-op.
      const foreverMemory = metadata.forever_memory === "true";
      const packageAddonCents = foreverMemory ? parseInt(metadata.package_price_cents || "2400", 10) : 0;
      const rushAddon = metadata.rush === "true";
      const rushAddonCents = rushAddon ? parseInt(metadata.rush_price_cents || "1000", 10) : 0;
      const songPriceCents = (foreverMemory || rushAddon)
        ? Math.max(0, priceCents - packageAddonCents - rushAddonCents)
        : priceCents;
      const songPrice = Math.floor(songPriceCents / 100);
      const addonUnlockFields = foreverMemory ? (() => {
        const nowIso = new Date().toISOString();
        const pi = typeof session.payment_intent === "string" ? session.payment_intent : null;
        return {
          package_unlocked_at: nowIso,
          package_price_cents: packageAddonCents,
          package_unlock_session_id: session.id,
          package_unlock_payment_intent_id: pi,
          lyrics_unlocked_at: nowIso, lyrics_price_cents: 0,
          download_unlocked_at: nowIso, download_price_cents: 0,
          bonus_unlocked_at: nowIso, bonus_price_cents: 0,
        };
      })() : {};
      const rushFields = rushAddon ? { rush_addon: true, rush_price_cents: rushAddonCents } : {};

      // Rush add-on overrides the expected delivery to 1 hour from now.
      const effectiveExpectedDelivery = rushAddon
        ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
        : expectedDelivery;

      // Strict notes format assertion -- do not proceed if format is wrong
      const notesValue = `stripe_session:${session.id}`;
      if (!/^stripe_session:cs_[a-zA-Z0-9_]+$/.test(notesValue)) {
        console.error(`[WEBHOOK] Unexpected notes format: ${notesValue}`);
        return new Response(
          JSON.stringify({ error: "Internal error: unexpected session ID format" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Compute timing for background automation
      const timing = computeOrderTiming(effectiveExpectedDelivery);
      console.log(`[WEBHOOK] Order timing: generate after ${timing.earliestGenerateAt}, send at ${timing.targetSendAt}`);
      
      // Compute inputs hash for change detection (includes all creative fields + language)
      const inputsHash = await computeInputsHash([
        metadata.recipientName || "",
        metadata.recipientNamePronunciation || "",
        metadata.specialQualities || "",
        metadata.favoriteMemory || "",
        metadata.genre || "",
        metadata.occasion || "",
        metadata.singerPreference || "",
        metadata.lyricsLanguageCode || "en",
      ]);

      const { data: newOrder, error: insertError } = await supabase
        .from("orders")
        .insert({
        pricing_tier: pricingTier,
          price: songPrice,               // integer dollars (song-only, excludes add-on)
          price_cents: songPriceCents,    // canonical cents (song-only, excludes add-on)
          expected_delivery: effectiveExpectedDelivery,
          customer_name: metadata.customerName || "",
          customer_email: metadata.customerEmail || session.customer_email || "",
          customer_phone: metadata.customerPhone || null,
          recipient_type: metadata.recipientType || "",
          recipient_name: metadata.recipientName || "",
          occasion: metadata.occasion || "",
          genre: metadata.genre || "",
          singer_preference: metadata.singerPreference || "",
          special_qualities: metadata.specialQualities || "",
          favorite_memory: metadata.favoriteMemory || "",
          special_message: metadata.specialMessage || null,
          device_type: "Web",
          notes: `stripe_session:${session.id}`,
          status: "paid",
          // Language setting
          lyrics_language_code: metadata.lyricsLanguageCode || "en",
          // SMS fields
          phone_e164: metadata.phoneE164 || null,
          sms_opt_in: metadata.smsOptIn === "true",
          timezone: metadata.timezone || null,
          // Background automation timing fields
          earliest_generate_at: timing.earliestGenerateAt,
          target_send_at: timing.targetSendAt,
          inputs_hash: inputsHash,
          delivery_status: "pending",
          // UTM tracking fields
          utm_source: metadata.utmSource || null,
          utm_medium: metadata.utmMedium || null,
          utm_campaign: metadata.utmCampaign || null,
          utm_content: metadata.utmContent || null,
          utm_term: metadata.utmTerm || null,
          ...addonUnlockFields,
          ...rushFields,
        })
        .select("id, recipient_name, occasion, genre, pricing_tier, customer_email, expected_delivery, revision_token")
        .single();

      // Handle unique constraint violation (race condition) - return existing order
      if (insertError) {
        // Check if it's a unique constraint violation (code 23505)
        if (insertError.code === "23505" || insertError.message?.includes("duplicate")) {
          console.log(`Race condition in webhook for session ${session.id}, fetching existing order`);
          const { data: raceOrder } = await supabase
            .from("orders")
            .select("id")
            .eq("notes", `stripe_session:${session.id}`)
            .single();

          if (raceOrder) {
            return new Response(
              JSON.stringify({ received: true, orderId: raceOrder.id, status: "already_exists" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        console.error("Database error:", insertError);
        // Return 500 so Stripe will retry
        return new Response(
          JSON.stringify({ error: "Failed to create order" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Order created via webhook: ${newOrder.id}`);

      await logActivity(supabase, "order", newOrder.id, "order_created", "system", `New order via Stripe, ${newOrder.pricing_tier}, $${priceCents / 100}${foreverMemory ? " + Forever Memory Package" : ""}${rushAddon ? " + Rush (1h)" : ""}`);

      // Mark only the matching lead as converted (non-blocking)
      try {
        const orderFingerprint = buildLeadFingerprintFromInput({
          recipientName: metadata.recipientName || "",
          recipientType: metadata.recipientType || "",
          occasion: metadata.occasion || "",
          genre: metadata.genre || "",
          singerPreference: metadata.singerPreference || "",
          specialQualities: metadata.specialQualities || "",
          favoriteMemory: metadata.favoriteMemory || "",
          specialMessage: metadata.specialMessage || "",
          lyricsLanguageCode: metadata.lyricsLanguageCode || "en",
        });

        const { data: leadCandidates } = await supabase
          .from("leads")
          .select("id, email, captured_at, recipient_name, recipient_type, occasion, genre, singer_preference, special_qualities, favorite_memory, special_message, lyrics_language_code, full_song_url, preview_song_url, song_title, cover_image_url, automation_lyrics, prev_automation_lyrics, prev_song_url, prev_cover_image_url")
          .ilike("email", (metadata.customerEmail || session.customer_email || "").toLowerCase())
          .neq("status", "converted")
          .order("captured_at", { ascending: false })
          .limit(20);

        const matchingLead = (leadCandidates || []).find((lead) =>
          new Date(lead.captured_at).getTime() <= Date.now() && buildLeadFingerprint(lead) === orderFingerprint
        );

        // Fallback: if no strict-fingerprint match, try a softer match on
        // email + recipient identity + occasion within the last 24h. This
        // catches the case where the customer tweaked a field between lead
        // capture and checkout (single char diff in special_qualities is
        // enough to bust the strict fingerprint, leaving a fully generated
        // lead song stranded and the new order shipping blank).
        let usedFallback = false;
        let resolvedLead = matchingLead;
        if (!resolvedLead) {
          const oneDayMs = 24 * 60 * 60 * 1000;
          const cutoff = Date.now() - oneDayMs;
          const softMatches = (leadCandidates || []).filter((lead) => {
            if (!lead.full_song_url) return false;
            if (new Date(lead.captured_at).getTime() < cutoff) return false;
            return (
              normalizeMatch(lead.recipient_name) === normalizeMatch(metadata.recipientName) &&
              normalizeMatch(lead.recipient_type) === normalizeMatch(metadata.recipientType) &&
              normalizeMatch(lead.occasion) === normalizeMatch(metadata.occasion)
            );
          });
          if (softMatches.length === 1) {
            resolvedLead = softMatches[0];
            usedFallback = true;
            console.log(`[WEBHOOK] Soft-fingerprint fallback matched lead ${resolvedLead.id} for order ${newOrder.id}`);
          } else if (softMatches.length > 1) {
            console.warn(`[WEBHOOK] Soft-fingerprint match ambiguous (${softMatches.length} candidates) — skipping for safety, order ${newOrder.id}`);
          }
        }

        if (resolvedLead) {
          const matchingLead = resolvedLead;
          await supabase
            .from("leads")
            .update({
              status: "converted",
              converted_at: new Date().toISOString(),
              order_id: newOrder.id,
            })
            .eq("id", matchingLead.id);
          console.log(`Lead ${matchingLead.id} marked as converted${usedFallback ? " (soft match)" : ""}`);

          // Remove from Brevo lead lists (fire-and-forget)
          fetch(`${supabaseUrl}/functions/v1/brevo-remove-converted`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({ email: matchingLead.email }),
          }).catch((e) => console.error("[WEBHOOK] Brevo remove failed:", e));

          if (usedFallback) {
            try {
              await logActivity(supabase, "order", newOrder.id, "lead_soft_match", "system",
                `Linked lead ${matchingLead.id} via soft fingerprint fallback (strict hash differed)`);
            } catch (_) { /* non-fatal */ }
          }

          // CRITICAL: Copy lead's pre-generated song assets onto the order so
          // the customer actually gets what they previewed. Without this, the
          // order ships blank because the standard checkout webhook path doesn't
          // know about the lead's existing song.
          const assetPatch = buildLeadAssetPatch(matchingLead);
          if (assetPatch) {
            await supabase.from("orders").update(assetPatch).eq("id", newOrder.id);
            console.log(`[WEBHOOK] Copied lead assets to order ${newOrder.id} (status=${assetPatch.status ?? "unchanged"})`);

            // If the song is ready, send the delivery email immediately.
            if (shouldDispatchDelivery(matchingLead)) {
              try {
                await fetch(`${supabaseUrl}/functions/v1/send-song-delivery`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${supabaseServiceKey}`,
                  },
                  body: JSON.stringify({
                    orderId: newOrder.id,
                    customerEmail: newOrder.customer_email,
                    customerName: metadata.customerName || "",
                    recipientName: newOrder.recipient_name,
                    occasion: newOrder.occasion,
                    songUrl: matchingLead.full_song_url,
                    revisionToken: newOrder.revision_token,
                  }),
                });
                console.log(`[WEBHOOK] Delivery email sent for standard-path lead-converted order ${newOrder.id}`);
              } catch (e) {
                console.error("[WEBHOOK] Failed to send delivery for lead-converted order:", e);
              }
            }
            // Lead had lyrics but no song — order is now at lyrics_ready.
            // Trigger audio generation so the customer doesn't get stuck.
            else if (matchingLead.automation_lyrics && !matchingLead.full_song_url) {
              try {
                console.log(`[WEBHOOK] Lyrics-only lead ${matchingLead.id} — triggering audio for order ${newOrder.id}`);
                await fetch(`${supabaseUrl}/functions/v1/automation-trigger`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${supabaseServiceKey}`,
                  },
                  body: JSON.stringify({ orderId: newOrder.id, skipLyrics: true, forceRun: true }),
                });
              } catch (e) {
                console.error("[WEBHOOK] Failed to trigger audio for lyrics-only order:", e);
              }
            }
          }
        }
      } catch (leadError) {
        console.error("Failed to update lead status:", leadError);
      }

      // Send order confirmation email (non-blocking)
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-order-confirmation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            orderId: newOrder.id,
            customerEmail: newOrder.customer_email,
            customerName: metadata.customerName || "",
            recipientName: newOrder.recipient_name,
            occasion: newOrder.occasion,
            genre: newOrder.genre,
            pricingTier: newOrder.pricing_tier,
            expectedDelivery: newOrder.expected_delivery,
            revisionToken: newOrder.revision_token,
            rushAddon,
          }),
        });
        console.log(`Confirmation email sent for order ${newOrder.id}`);
      } catch (emailError) {
        console.error("Failed to send confirmation email:", emailError);
      }

      // TikTok server-side CompletePayment event (non-blocking)
      try {
        await fetch(`${supabaseUrl}/functions/v1/tiktok-track-event`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            event: "CompletePayment",
            email: metadata.customerEmail || session.customer_email || "",
            phone: metadata.phoneE164 || metadata.customerPhone || undefined,
            orderId: newOrder.id,
            value: priceCents / 100,
            currency: "USD",
            contentId: newOrder.id,
          }),
        });
        console.log(`[TIKTOK] Server event sent for order ${newOrder.id}`);
      } catch (tiktokError) {
        console.error("[TIKTOK] Failed to send server event:", tiktokError);
      }

      // Sync order to Zapier → Google Sheets (non-blocking)
      const zapierWebhookUrl = Deno.env.get("ZAPIER_WEBHOOK_URL");
      if (zapierWebhookUrl) {
        try {
          await fetch(zapierWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: newOrder.id,
              createdAt: new Date().toISOString(),
              status: "paid",
              pricingTier: newOrder.pricing_tier,
              price: priceCents / 100,
              expectedDelivery: newOrder.expected_delivery,
              customerName: metadata.customerName || "",
              customerEmail: newOrder.customer_email,
              customerPhone: metadata.customerPhone || "",
              recipientType: metadata.recipientType || "",
              recipientName: newOrder.recipient_name,
              occasion: newOrder.occasion,
              genre: newOrder.genre,
              singerPreference: metadata.singerPreference || "",
              specialQualities: metadata.specialQualities || "",
              favoriteMemory: metadata.favoriteMemory || "",
              specialMessage: metadata.specialMessage || "",
              deviceType: "Web",
            }),
          });
          console.log(`Order ${newOrder.id} synced to Zapier`);
        } catch (zapierError) {
          console.error("Failed to sync to Zapier:", zapierError);
        }
      }

      return new Response(
        JSON.stringify({ received: true, orderId: newOrder.id, status: "created" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Acknowledge other event types we don't handle
    console.log(`Unhandled event type: ${event.type}`);
    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Stripe webhook error:", error);
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
