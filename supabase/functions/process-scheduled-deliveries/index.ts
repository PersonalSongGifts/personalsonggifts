import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { computeInputsHash } from "../_shared/hash-utils.ts";
import { sendSms } from "../_shared/brevo-sms.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ======= BACKGROUND AUTOMATION CONSTANTS =======
const MAX_CONCURRENT_GENERATIONS = 9; // Global cap: max 9 in-flight across orders + leads
const MAX_LEAD_PREVIEWS_PER_RUN = 5; // Catch-up: max 5 overdue lead previews
const AUDIO_RECOVERY_AFTER_MINUTES = 5; // Recover stuck audio jobs after 5 min
const MAX_AUDIO_RECOVERIES_PER_RUN = 3;
const ACTIVE_STATUSES = ["queued", "pending", "lyrics_generating", "audio_generating"];
const MAX_AUTO_RETRIES = 3; // Max retry attempts before permanent failure
const RETRY_BACKOFF_MINUTES = 10; // Wait at least 10 min before retrying
const MAX_RETRIES_PER_RUN = 5; // Max failed items to reset per cron run


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();
    const results: Record<string, unknown> = { timestamp: now };

    // ======= 1. STUCK AUDIO RECOVERY =======
    // Sometimes Kie.ai doesn't call our webhook. Re-invoke callback handler for stuck jobs.
    try {
      const cutoffIso = new Date(
        Date.now() - AUDIO_RECOVERY_AFTER_MINUTES * 60 * 1000,
      ).toISOString();

      // Recover stuck leads
      const { data: stuckLeads } = await supabase
        .from("leads")
        .select("id, automation_task_id, automation_started_at")
        .eq("automation_status", "audio_generating")
        .is("automation_manual_override_at", null)
        .is("preview_song_url", null)
        .not("automation_task_id", "is", null)
        .not("automation_started_at", "is", null)
        .lte("automation_started_at", cutoffIso)
        .order("automation_started_at", { ascending: true })
        .limit(MAX_AUDIO_RECOVERIES_PER_RUN);

      // Recover stuck orders
      const { data: stuckOrders } = await supabase
        .from("orders")
        .select("id, automation_task_id, automation_started_at")
        .eq("automation_status", "audio_generating")
        .is("automation_manual_override_at", null)
        .is("song_url", null)
        .not("automation_task_id", "is", null)
        .not("automation_started_at", "is", null)
        .lte("automation_started_at", cutoffIso)
        .order("automation_started_at", { ascending: true })
        .limit(MAX_AUDIO_RECOVERIES_PER_RUN);

      const stuckTotal = (stuckLeads?.length || 0) + (stuckOrders?.length || 0);
      if (stuckTotal > 0) {
        console.log(`[RECOVERY] Found ${stuckTotal} stuck entities (${stuckLeads?.length || 0} leads, ${stuckOrders?.length || 0} orders)`);
      }

      for (const entity of [...(stuckLeads || []), ...(stuckOrders || [])]) {
        const taskId = entity.automation_task_id as string | null;
        if (!taskId) continue;

        console.log(`[RECOVERY] Re-invoking callback for entity ${entity.id} (taskId=${taskId})`);
        await fetch(`${supabaseUrl}/functions/v1/automation-suno-callback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ taskId, data: { task_id: taskId } }),
        });
      }
      
      results.stuckRecoveries = stuckTotal;

      // --- FAILSAFE: Auto-complete orders that have a song but stuck automation_status ---
      const { data: stuckWithSong } = await supabase
        .from("orders")
        .select("id, automation_status")
        .in("automation_status", ["queued", "pending", "lyrics_generating", "audio_generating"])
        .not("song_url", "is", null)
        .is("sent_at", null)
        .limit(10);

      if (stuckWithSong && stuckWithSong.length > 0) {
        console.log(`[FAILSAFE] Found ${stuckWithSong.length} orders with song_url but stuck automation_status`);
        for (const order of stuckWithSong) {
          console.log(`[FAILSAFE] Auto-completing order ${order.id} (was: ${order.automation_status})`);
          await supabase
            .from("orders")
            .update({
              automation_status: "completed",
              generated_at: new Date().toISOString(),
              automation_audio_url_source: "failsafe_recovery",
            })
            .eq("id", order.id);
        }
        results.failsafeRecoveries = stuckWithSong.length;
      }

      // Same failsafe for leads
      const { data: stuckLeadsWithSong } = await supabase
        .from("leads")
        .select("id, automation_status")
        .in("automation_status", ["queued", "pending", "lyrics_generating", "audio_generating"])
        .not("preview_song_url", "is", null)
        .is("sent_at", null)
        .limit(10);

      if (stuckLeadsWithSong && stuckLeadsWithSong.length > 0) {
        console.log(`[FAILSAFE] Found ${stuckLeadsWithSong.length} leads with song but stuck automation_status`);
        for (const lead of stuckLeadsWithSong) {
          await supabase
            .from("leads")
            .update({
              automation_status: "completed",
              generated_at: new Date().toISOString(),
              automation_audio_url_source: "failsafe_recovery",
            })
            .eq("id", lead.id);
        }
      }

      // --- FAILSAFE: Reset records marked "completed" but missing audio ---
      const { data: completedNoAudioOrders } = await supabase
        .from("orders")
        .select("id, automation_status")
        .eq("automation_status", "completed")
        .is("song_url", null)
        .is("dismissed_at", null)
        .limit(10);

      if (completedNoAudioOrders?.length) {
        for (const order of completedNoAudioOrders) {
          console.log(`[FAILSAFE] Order ${order.id} marked completed but has no song_url, resetting to failed`);
          await supabase
            .from("orders")
            .update({
              automation_status: "failed",
              automation_last_error: "Marked completed without song_url - reset by failsafe",
            })
            .eq("id", order.id);
        }
        results.completedNoAudioOrders = completedNoAudioOrders.length;
      }

      // Same for leads
      const { data: completedNoAudioLeads } = await supabase
        .from("leads")
        .select("id, automation_status")
        .eq("automation_status", "completed")
        .is("preview_song_url", null)
        .is("dismissed_at", null)
        .limit(10);

      if (completedNoAudioLeads?.length) {
        for (const lead of completedNoAudioLeads) {
          console.log(`[FAILSAFE] Lead ${lead.id} marked completed but has no preview_song_url, resetting to failed`);
          await supabase
            .from("leads")
            .update({
              automation_status: "failed",
              automation_last_error: "Marked completed without preview_song_url - reset by failsafe",
            })
            .eq("id", lead.id);
        }
        results.completedNoAudioLeads = completedNoAudioLeads.length;
      }

      // --- STUCK EARLY-STAGE RECOVERY ---
      // Catch items stuck in lyrics_generating, pending, or queued for >15 min
      // These have no audio task_id so the audio recovery above won't catch them
      const earlyStuckCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const earlyStuckStatuses = ["lyrics_generating", "pending", "queued"];
      let earlyStuckRecovered = 0;

      // Orders stuck in early stages
      const { data: earlyStuckOrders } = await supabase
        .from("orders")
        .select("id, automation_status, automation_retry_count")
        .in("automation_status", earlyStuckStatuses)
        .is("automation_manual_override_at", null)
        .is("dismissed_at", null)
        .neq("status", "cancelled")
        .lte("automation_started_at", earlyStuckCutoff)
        .order("automation_started_at", { ascending: true })
        .limit(MAX_RETRIES_PER_RUN);

      for (const order of earlyStuckOrders || []) {
        const retryCount = (order.automation_retry_count || 0) + 1;
        if (retryCount > MAX_AUTO_RETRIES) {
          console.log(`[RECOVERY] Order ${order.id} stuck in ${order.automation_status}, exceeded max retries → permanently_failed`);
          await supabase.from("orders").update({
            automation_status: "permanently_failed",
            automation_last_error: `Stuck in ${order.automation_status} for >15min, exceeded max retries (${MAX_AUTO_RETRIES})`,
          }).eq("id", order.id);
        } else {
          console.log(`[RECOVERY] Order ${order.id} stuck in ${order.automation_status} >15min, resetting (retry ${retryCount}/${MAX_AUTO_RETRIES})`);
          await supabase.from("orders").update({
            automation_status: null,
            automation_started_at: null,
            automation_task_id: null,
            automation_last_error: `Auto-recovered from stuck ${order.automation_status}`,
            automation_retry_count: retryCount,
          }).eq("id", order.id);
          earlyStuckRecovered++;
        }
      }

      // Leads stuck in early stages
      const { data: earlyStuckLeads } = await supabase
        .from("leads")
        .select("id, automation_status, automation_retry_count")
        .in("automation_status", earlyStuckStatuses)
        .is("automation_manual_override_at", null)
        .is("dismissed_at", null)
        .lte("automation_started_at", earlyStuckCutoff)
        .order("automation_started_at", { ascending: true })
        .limit(MAX_RETRIES_PER_RUN);

      for (const lead of earlyStuckLeads || []) {
        const retryCount = (lead.automation_retry_count || 0) + 1;
        if (retryCount > MAX_AUTO_RETRIES) {
          console.log(`[RECOVERY] Lead ${lead.id} stuck in ${lead.automation_status}, exceeded max retries → permanently_failed`);
          await supabase.from("leads").update({
            automation_status: "permanently_failed",
            automation_last_error: `Stuck in ${lead.automation_status} for >15min, exceeded max retries (${MAX_AUTO_RETRIES})`,
          }).eq("id", lead.id);
        } else {
          console.log(`[RECOVERY] Lead ${lead.id} stuck in ${lead.automation_status} >15min, resetting (retry ${retryCount}/${MAX_AUTO_RETRIES})`);
          await supabase.from("leads").update({
            automation_status: null,
            automation_started_at: null,
            automation_task_id: null,
            automation_last_error: `Auto-recovered from stuck ${lead.automation_status}`,
            automation_retry_count: retryCount,
          }).eq("id", lead.id);
          earlyStuckRecovered++;
        }
      }

      if (earlyStuckRecovered > 0) {
        console.log(`[RECOVERY] Recovered ${earlyStuckRecovered} items stuck in early stages`);
      }
      results.earlyStuckRecoveries = earlyStuckRecovered;
    } catch (e) {
      console.error("[RECOVERY] Error:", e);
    }

    // ======= 2. GENERATION QUEUE (Background Automation) =======
    // Pick up entities ready for generation based on earliest_generate_at
    try {
      // Check if automation is globally enabled
      const { data: enabledSetting } = await supabase
        .from("admin_settings")
        .select("value")
        .eq("key", "automation_enabled")
        .maybeSingle();

      const automationEnabled = (enabledSetting as { value: string } | null)?.value !== "false";

      if (automationEnabled) {
        // Check automation target
        const { data: targetSetting } = await supabase
          .from("admin_settings")
          .select("value")
          .eq("key", "automation_target")
          .maybeSingle();

        const automationTarget = (targetSetting as { value: string } | null)?.value || "leads";
        const processOrders = automationTarget === "orders" || automationTarget === "both";
        const processLeads = automationTarget === "leads" || automationTarget === "both";

        // --- CONCURRENCY CAP: Count active jobs across both tables ---
        let activeCount = 0;

        const { count: activeOrders } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .in("automation_status", ACTIVE_STATUSES);

        const { count: activeLeads } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .in("automation_status", ACTIVE_STATUSES);

        activeCount = (activeOrders || 0) + (activeLeads || 0);
        const availableSlots = Math.max(0, MAX_CONCURRENT_GENERATIONS - activeCount);

        console.log(`[SCHEDULER] Active jobs: ${activeCount} (${activeOrders || 0} orders, ${activeLeads || 0} leads), available slots: ${availableSlots}`);

        let generationsTriggered = 0;

        if (availableSlots > 0) {
          // Process ORDERS first (priority tier gets priority within orders)
          if (processOrders && generationsTriggered < availableSlots) {
            const { data: pendingOrders } = await supabase
              .from("orders")
              .select("id, pricing_tier")
              .is("automation_status", null)
              .not("earliest_generate_at", "is", null)
              .lte("earliest_generate_at", now)
              .is("dismissed_at", null)
              .neq("status", "cancelled")
              .or("next_attempt_at.is.null,next_attempt_at.lte." + now)
              .order("pricing_tier", { ascending: false }) // 'priority' before 'standard'
              .order("earliest_generate_at", { ascending: true })
              .limit(availableSlots - generationsTriggered);

            for (const order of pendingOrders || []) {
              // Atomic claim: update status only if still null (prevents double-pickup)
              const { data: claimed } = await supabase
                .from("orders")
                .update({
                  automation_status: "queued",
                  automation_started_at: now,
                })
                .eq("id", order.id)
                .is("automation_status", null)
                .select("id")
                .single();

              if (claimed) {
                console.log(`[SCHEDULER] Triggering generation for order ${order.id} (${order.pricing_tier})`);
                await fetch(`${supabaseUrl}/functions/v1/automation-trigger`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${supabaseServiceKey}`,
                  },
                  body: JSON.stringify({ orderId: order.id }),
                });
                generationsTriggered++;
              }
            }
          }

          // Process LEADS (only remaining slots, oldest first, quality filtered)
          if (processLeads && generationsTriggered < availableSlots) {
            // Get quality threshold for filtering at pickup time
            const { data: thresholdSetting } = await supabase
              .from("admin_settings")
              .select("value")
              .eq("key", "automation_quality_threshold")
              .maybeSingle();

            const qualityThreshold = parseInt((thresholdSetting as { value: string } | null)?.value || "65", 10);

            const { data: pendingLeads } = await supabase
              .from("leads")
              .select("id, quality_score")
              .is("automation_status", null)
              .not("earliest_generate_at", "is", null)
              .lte("earliest_generate_at", now)
              .is("dismissed_at", null)
              .neq("status", "converted")
              .gte("quality_score", qualityThreshold) // Quality filter at pickup
              .or("next_attempt_at.is.null,next_attempt_at.lte." + now)
              .order("captured_at", { ascending: true }) // Oldest first
              .limit(availableSlots - generationsTriggered);

            for (const lead of pendingLeads || []) {
              // Atomic claim
              const { data: claimed } = await supabase
                .from("leads")
                .update({
                  automation_status: "queued",
                  automation_started_at: now,
                })
                .eq("id", lead.id)
                .is("automation_status", null)
                .select("id")
                .single();

              if (claimed) {
                console.log(`[SCHEDULER] Triggering generation for lead ${lead.id} (score: ${lead.quality_score}, oldest-first)`);
                await fetch(`${supabaseUrl}/functions/v1/automation-trigger`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${supabaseServiceKey}`,
                  },
                  body: JSON.stringify({ leadId: lead.id }),
                });
                generationsTriggered++;
              }
            }
          }
        }

        results.generationsTriggered = generationsTriggered;
        results.activeJobs = activeCount;
        results.availableSlots = availableSlots;
      } else {
        results.generationsTriggered = 0;
        results.automationDisabled = true;
      }
    } catch (e) {
      console.error("[SCHEDULER] Generation queue error:", e);
    }

    // ======= 2b. AUTO-RETRY FAILED GENERATIONS =======
    // Reset failed leads/orders for retry with backoff + max retry cap
    try {
      const retryCutoff = new Date(Date.now() - RETRY_BACKOFF_MINUTES * 60 * 1000).toISOString();
      let totalRetried = 0;

      // Retry failed orders first (paid = higher priority)
      const { data: failedOrders } = await supabase
        .from("orders")
        .select("id, automation_retry_count")
        .eq("automation_status", "failed")
        .is("dismissed_at", null)
        .neq("status", "cancelled")
        .lte("automation_started_at", retryCutoff)
        .lt("automation_retry_count", MAX_AUTO_RETRIES)
        .order("automation_started_at", { ascending: true })
        .limit(MAX_RETRIES_PER_RUN);

      for (const order of failedOrders || []) {
        const { data: reset } = await supabase
          .from("orders")
          .update({
            automation_status: null,
            automation_last_error: null,
            automation_started_at: null,
            automation_task_id: null,
            automation_retry_count: (order.automation_retry_count || 0) + 1,
          })
          .eq("id", order.id)
          .eq("automation_status", "failed")
          .select("id")
          .maybeSingle();

        if (reset) {
          console.log(`[RETRY] Reset failed order ${order.id} for retry (attempt ${(order.automation_retry_count || 0) + 1}/${MAX_AUTO_RETRIES})`);
          totalRetried++;
        }
      }

      // Retry failed leads (remaining slots)
      const remainingRetrySlots = MAX_RETRIES_PER_RUN - totalRetried;
      if (remainingRetrySlots > 0) {
        const { data: failedLeads } = await supabase
          .from("leads")
          .select("id, automation_retry_count")
          .eq("automation_status", "failed")
          .is("dismissed_at", null)
          .neq("status", "converted")
          .lte("automation_started_at", retryCutoff)
          .lt("automation_retry_count", MAX_AUTO_RETRIES)
          .order("automation_started_at", { ascending: true })
          .limit(remainingRetrySlots);

        for (const lead of failedLeads || []) {
          const { data: reset } = await supabase
            .from("leads")
            .update({
              automation_status: null,
              automation_last_error: null,
              automation_started_at: null,
              automation_task_id: null,
              automation_retry_count: (lead.automation_retry_count || 0) + 1,
            })
            .eq("id", lead.id)
            .eq("automation_status", "failed")
            .select("id")
            .maybeSingle();

          if (reset) {
            console.log(`[RETRY] Reset failed lead ${lead.id} for retry (attempt ${(lead.automation_retry_count || 0) + 1}/${MAX_AUTO_RETRIES})`);
            totalRetried++;
          }
        }
      }

      if (totalRetried > 0) {
        console.log(`[RETRY] Reset ${totalRetried} failed items for retry`);
      }
      results.autoRetried = totalRetried;
    } catch (e) {
      console.error("[RETRY] Auto-retry error:", e);
    }

    // ======= 3. ORDER DELIVERY QUEUE =======
    // Send delivery emails for orders where target_send_at has passed
    const orderDeliveryResults: Array<{ orderId: string; success: boolean; error?: string }> = [];
    
    try {
      // Reset any orders stuck in "delivering" for >15 minutes back to "failed"
      // so they're eligible for retry on the next run
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: stuckDelivering } = await supabase
        .from("orders")
        .update({
          delivery_status: "failed",
          delivery_last_error: "Stuck in delivering state for >15 minutes (timeout reset)",
          delivered_at: null,
        })
        .eq("delivery_status", "delivering")
        .is("sent_at", null)
        .lte("delivered_at", fifteenMinAgo)
        .select("id");
      
      if (stuckDelivering && stuckDelivering.length > 0) {
        console.log(`[DELIVERY] Reset ${stuckDelivering.length} stuck "delivering" orders: ${stuckDelivering.map(o => o.id).join(", ")}`);
      }

      const { data: ordersToDeliver } = await supabase
        .from("orders")
        .select("*")
        .not("target_send_at", "is", null)
        .lte("target_send_at", now)
        .eq("automation_status", "completed")
        .is("sent_at", null)
        .is("dismissed_at", null)
        .neq("status", "cancelled")
        .not("song_url", "is", null)
        .or("delivery_status.is.null,delivery_status.eq.scheduled,delivery_status.eq.failed") // Pickup null, scheduled, or failed (excludes needs_review, sent, delivering)
        .limit(10);

      console.log(`[DELIVERY] Found ${ordersToDeliver?.length || 0} orders ready for delivery`);

      for (const order of ordersToDeliver || []) {
        try {
          // Input hash validation - check if inputs changed after generation
          const currentHash = await computeInputsHash([
            order.recipient_name || "",
            order.recipient_name_pronunciation || "",
            order.special_qualities || "",
            order.favorite_memory || "",
            order.genre || "",
            order.occasion || "",
            order.singer_preference || "",
            order.lyrics_language_code || "en",
          ]);
          
          if (order.inputs_hash && currentHash !== order.inputs_hash) {
            // If an admin manually edited inputs, block delivery for safety
            if (order.automation_manual_override_at) {
              console.log(`[DELIVERY] Order ${order.id} inputs changed (manual edit detected), marking needs_review`);
              await supabase
                .from("orders")
                .update({
                  delivery_status: "needs_review",
                  delivery_last_error: "Inputs changed after generation",
                })
                .eq("id", order.id);
              orderDeliveryResults.push({ orderId: order.id, success: false, error: "Inputs changed" });
              continue;
            }
            // No manual edit — likely a hash formula evolution. Recompute and proceed.
            console.log(`[DELIVERY] Order ${order.id} hash mismatch without manual override, recomputing hash and proceeding`);
            await supabase
              .from("orders")
              .update({ inputs_hash: currentHash })
              .eq("id", order.id);
          }

          // === FILE ACCESSIBILITY GUARD ===
          // Verify the song file actually exists and is >10KB before delivering
          try {
            const headResponse = await fetch(order.song_url, { method: "HEAD", signal: AbortSignal.timeout(10000) });
            const contentLength = parseInt(headResponse.headers.get("content-length") || "0");
            
            if (!headResponse.ok || contentLength < 10000) {
              console.error(`[DELIVERY] Song file invalid for order ${order.id}: status=${headResponse.status}, size=${contentLength}`);
              // Clear bad song_url and reset for regeneration
              await supabase
                .from("orders")
                .update({
                  song_url: null,
                  automation_status: null,
                  automation_started_at: null,
                  automation_task_id: null,
                  delivery_status: null,
                  delivery_last_error: `Song file empty/missing (${contentLength} bytes). Auto-resetting for regeneration.`,
                })
                .eq("id", order.id);
              orderDeliveryResults.push({ orderId: order.id, success: false, error: `Song file invalid (${contentLength} bytes)` });
              continue;
            }
            console.log(`[DELIVERY] Song file verified for order ${order.id}: ${contentLength} bytes`);
          } catch (headError) {
            console.error(`[DELIVERY] Song file verification failed for order ${order.id}:`, headError);
            // Don't block delivery on HEAD failure - the file might still be accessible
          }

          // Claim row for delivery (prevents duplicate processing)
          // Use delivered_at as timestamp marker for stuck detection
          const { data: claimed, error: claimError } = await supabase
            .from("orders")
            .update({
              delivery_status: "delivering",
              delivered_at: now, // Timestamp marker for timeout detection
            })
            .eq("id", order.id)
            .is("sent_at", null) // Optimistic lock
            .select("id");

          if (claimError) throw claimError;
          if (!claimed || claimed.length === 0) {
            console.log(`[DELIVERY] Order ${order.id} already claimed, skipping`);
            continue;
          }

          // Determine effective recipient email (override > original)
          const effectiveEmail = order.customer_email_override || order.customer_email;

          // Send delivery email (with SMS fields)
          const emailResponse = await fetch(
            `${supabaseUrl}/functions/v1/send-song-delivery`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                orderId: order.id,
                customerEmail: effectiveEmail,
                customerName: order.customer_name,
                recipientName: order.recipient_name,
                occasion: order.occasion,
                songUrl: order.song_url,
                ccEmail: order.customer_email_cc,
                // SMS fields
                phoneE164: order.phone_e164,
                smsOptIn: order.sms_opt_in,
                timezone: order.timezone,
                smsStatus: order.sms_status,
              }),
            }
          );

          // Track sent recipients
          const sentEmails = [effectiveEmail];
          if (order.customer_email_cc) sentEmails.push(order.customer_email_cc);

          if (!emailResponse.ok) {
            const errorText = await emailResponse.text();
            console.error(`[DELIVERY] Email failed for order ${order.id}:`, errorText);
            // Mark as failed -- eligible for retry on next cron run
            await supabase
              .from("orders")
              .update({
                delivery_status: "failed",
                delivery_last_error: `Email send failed (${emailResponse.status}): ${errorText.substring(0, 500)}`,
                delivered_at: null, // Clear timestamp marker
              })
              .eq("id", order.id);
            orderDeliveryResults.push({ orderId: order.id, success: false, error: `Email failed: ${errorText}` });
          } else {
            // Email confirmed sent -- now safe to mark as delivered
            await supabase
              .from("orders")
              .update({
                status: "delivered",
                delivery_status: "sent",
                sent_at: now,
                delivered_at: now,
                sent_to_emails: sentEmails,
              })
              .eq("id", order.id);

            // Parse SMS result from response and update order
            try {
              const deliveryResult = await emailResponse.json();
              if (deliveryResult.sms) {
                const smsUpdate: Record<string, unknown> = {};
                if (deliveryResult.sms.sent) {
                  smsUpdate.sms_status = "sent";
                  smsUpdate.sms_sent_at = now;
                } else if (deliveryResult.sms.scheduled) {
                  smsUpdate.sms_status = "scheduled";
                  smsUpdate.sms_scheduled_for = deliveryResult.sms.scheduledFor;
                } else if (deliveryResult.sms.error) {
                  smsUpdate.sms_status = "failed";
                  smsUpdate.sms_last_error = deliveryResult.sms.error.substring(0, 500);
                }
                if (Object.keys(smsUpdate).length > 0) {
                  await supabase.from("orders").update(smsUpdate).eq("id", order.id);
                }
              }
            } catch { /* non-blocking */ }
            console.log(`[DELIVERY] ✅ Order ${order.id} delivered to ${sentEmails.join(", ")}`);
            orderDeliveryResults.push({ orderId: order.id, success: true });
          }
        } catch (orderError) {
          console.error(`[DELIVERY] Error for order ${order.id}:`, orderError);
          orderDeliveryResults.push({
            orderId: order.id,
            success: false,
            error: orderError instanceof Error ? orderError.message : "Unknown error",
          });
        }
      }
    } catch (e) {
      console.error("[DELIVERY] Order delivery queue error:", e);
    }
    
    results.orderDeliveries = orderDeliveryResults;

    // ======= 4. LEGACY: Scheduled delivery (ready status) for orders without new timing =======
    const legacyDeliveryResults: Array<{ orderId: string; success: boolean; error?: string }> = [];
    
    try {
      const { data: legacyOrders } = await supabase
        .from("orders")
        .select("*")
        .not("scheduled_delivery_at", "is", null)
        .lte("scheduled_delivery_at", now)
        .eq("status", "ready")
        .not("song_url", "is", null)
        .limit(10);

      for (const order of legacyOrders || []) {
        try {
          // Claim row with "delivering" status (keep status as "ready" until confirmed)
          const { data: claimed, error: claimError } = await supabase
            .from("orders")
            .update({
              delivery_status: "delivering",
              delivered_at: now, // Timestamp marker for timeout detection
            })
            .eq("id", order.id)
            .eq("status", "ready")
            .select("id");

          if (claimError) throw claimError;
          if (!claimed || claimed.length === 0) {
            console.log(`[LEGACY] Order ${order.id} already claimed, skipping`);
            continue;
          }

          const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-song-delivery`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              orderId: order.id,
              customerEmail: order.customer_email_override || order.customer_email,
              customerName: order.customer_name,
              recipientName: order.recipient_name,
              occasion: order.occasion,
              songUrl: order.song_url,
              ccEmail: order.customer_email_cc,
            }),
          });

          const effectiveEmail = order.customer_email_override || order.customer_email;
          const sentEmails = [effectiveEmail];
          if (order.customer_email_cc) sentEmails.push(order.customer_email_cc);

          if (!emailResponse.ok) {
            const errorText = await emailResponse.text();
            console.error(`[LEGACY] Email failed for order ${order.id}:`, errorText);
            await supabase
              .from("orders")
              .update({
                delivery_status: "failed",
                delivery_last_error: `Email send failed (${emailResponse.status}): ${errorText.substring(0, 500)}`,
                delivered_at: null,
              })
              .eq("id", order.id);
            legacyDeliveryResults.push({ orderId: order.id, success: false, error: `Email failed: ${errorText}` });
          } else {
            // Email confirmed -- now safe to mark delivered
            await supabase
              .from("orders")
              .update({
                status: "delivered",
                delivery_status: "sent",
                sent_at: now,
                delivered_at: now,
                sent_to_emails: sentEmails,
              })
              .eq("id", order.id);
            console.log(`[LEGACY] ✅ Order ${order.id} delivered to ${sentEmails.join(", ")}`);
            legacyDeliveryResults.push({ orderId: order.id, success: true });
          }
        } catch (orderError) {
          legacyDeliveryResults.push({
            orderId: order.id,
            success: false,
            error: orderError instanceof Error ? orderError.message : "Unknown error",
          });
        }
      }
    } catch (e) {
      console.error("[DELIVERY] Legacy delivery queue error:", e);
    }
    
    results.legacyDeliveries = legacyDeliveryResults;

    // ======= 5. SCHEDULED RESENDS =======
    const resendResults: Array<{ orderId: string; success: boolean; error?: string }> = [];
    
    try {
      const { data: resendOrders } = await supabase
        .from("orders")
        .select("*")
        .not("resend_scheduled_at", "is", null)
        .lte("resend_scheduled_at", now)
        .eq("status", "delivered")
        .not("song_url", "is", null)
        .limit(10);

      for (const order of resendOrders || []) {
        try {
          // Save original resend_scheduled_at so we can restore on failure
          const originalResendAt = order.resend_scheduled_at;

          // Clear resend_scheduled_at to prevent duplicate pickup
          await supabase
            .from("orders")
            .update({ resend_scheduled_at: null })
            .eq("id", order.id)
            .not("resend_scheduled_at", "is", null);

          const effectiveEmail = order.customer_email_override || order.customer_email;

          const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-song-delivery`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              orderId: order.id,
              customerEmail: effectiveEmail,
              customerName: order.customer_name,
              recipientName: order.recipient_name,
              occasion: order.occasion,
              songUrl: order.song_url,
              ccEmail: order.customer_email_cc,
              // SMS fields for resend
              phoneE164: order.phone_e164,
              smsOptIn: order.sms_opt_in,
              timezone: order.timezone,
              smsStatus: null, // Allow SMS to re-fire on resend
            }),
          });

          if (!emailResponse.ok) {
            const errorText = await emailResponse.text();
            console.error(`[RESEND] Email failed for order ${order.id}:`, errorText);
            // Restore resend_scheduled_at so it retries on next cron run
            await supabase
              .from("orders")
              .update({
                resend_scheduled_at: originalResendAt,
                delivery_last_error: `Resend failed (${emailResponse.status}): ${errorText.substring(0, 500)}`,
              })
              .eq("id", order.id);
            resendResults.push({ orderId: order.id, success: false, error: `Email failed: ${errorText}` });
          } else {
            // Append to sent_to_emails array
            const existingSent = Array.isArray(order.sent_to_emails) ? order.sent_to_emails : [];
            const newSentEmails = [...new Set([...existingSent, effectiveEmail, ...(order.customer_email_cc ? [order.customer_email_cc] : [])])];
            
            await supabase
              .from("orders")
              .update({
                sent_to_emails: newSentEmails,
                delivery_status: "sent",
                delivery_last_error: null,
              })
              .eq("id", order.id);
            
            console.log(`[RESEND] ✅ Order ${order.id} resent to ${newSentEmails.join(", ")}`);
            resendResults.push({ orderId: order.id, success: true });
          }
        } catch (orderError) {
          resendResults.push({
            orderId: order.id,
            success: false,
            error: orderError instanceof Error ? orderError.message : "Unknown error",
          });
        }
      }
    } catch (e) {
      console.error("[DELIVERY] Resend queue error:", e);
    }
    
    results.resends = resendResults;

    // ======= 6. LEAD PREVIEW QUEUE =======
    // Send preview emails for leads where target_send_at has passed
    const leadPreviewResults: Array<{ leadId: string; success: boolean; error?: string }> = [];
    
    try {
      const brevoApiKey = Deno.env.get("BREVO_API_KEY");
      const senderEmail = "support@personalsonggifts.com";
      const senderName = "Personal Song Gifts";

      if (!brevoApiKey) {
        console.error("[PREVIEW] BREVO_API_KEY not configured");
      } else {
        // Query leads ready for preview (both new target_send_at and legacy preview_scheduled_at)
        const { data: leadsToPreview } = await supabase
          .from("leads")
          .select("*")
          .is("preview_sent_at", null)
          .eq("status", "song_ready")
          .is("dismissed_at", null)
          .not("preview_song_url", "is", null)
          .not("preview_token", "is", null)
          .or(`target_send_at.lte.${now},preview_scheduled_at.lte.${now}`)
          .order("target_send_at", { ascending: true })
          .limit(MAX_LEAD_PREVIEWS_PER_RUN);

        console.log(`[PREVIEW] Found ${leadsToPreview?.length || 0} leads ready for preview`);

        for (const lead of leadsToPreview || []) {
          try {
            if (lead.status === "converted") {
              leadPreviewResults.push({ leadId: lead.id, success: false, error: "Lead converted" });
              continue;
            }

            // Purchase guard: check if customer already has a paid order
            const { data: existingOrder } = await supabase
              .from("orders")
              .select("id")
              .eq("customer_email", lead.email)
              .neq("status", "cancelled")
              .limit(1)
              .maybeSingle();

            if (existingOrder) {
              console.log(`[PREVIEW] Lead ${lead.id} has paid order ${existingOrder.id}, auto-converting`);
              await supabase.from("leads")
                .update({ status: "converted", converted_at: new Date().toISOString(), order_id: existingOrder.id })
                .eq("id", lead.id);
              leadPreviewResults.push({ leadId: lead.id, success: false, error: "Auto-converted: customer already paid" });
              continue;
            }

            const previewUrl = `https://personalsonggifts.lovable.app/preview/${lead.preview_token}`;

            const emailHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: Arial, Helvetica, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <p style="font-size: 16px; line-height: 1.6; color: #222222; margin: 0 0 16px 0;">Hi ${lead.customer_name},</p>

    <p style="font-size: 16px; line-height: 1.6; color: #222222; margin: 0 0 16px 0;">
      Your personalized ${lead.occasion} song for ${lead.recipient_name} is ready for you to hear.
    </p>

    <p style="font-size: 16px; line-height: 1.6; color: #222222; margin: 0 0 16px 0;">
      Listen to your preview here:<br>
      <a href="${previewUrl}" style="color: #1a73e8;">${previewUrl}</a>
    </p>

    <p style="font-size: 16px; line-height: 1.6; color: #222222; margin: 0 0 16px 0;">
      We'd love for you to hear the full song — if you like the preview, you can unlock it directly from the page above.
    </p>

    <p style="font-size: 16px; line-height: 1.6; color: #222222; margin: 0 0 32px 0;">
      Warmly,<br>
      Personal Song Gifts
    </p>

    <p style="font-size: 12px; color: #888888; margin: 0;">
      Personal Song Gifts &middot; 2108 N ST STE N, Sacramento, CA 95816<br>
      <a href="https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(lead.lead_email_override || lead.email)}" style="color: #888888;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;

            const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
              method: "POST",
              headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "api-key": brevoApiKey,
              },
              body: JSON.stringify({
                sender: { name: senderName, email: senderEmail },
                replyTo: { email: senderEmail, name: senderName },
                to: [{ email: lead.lead_email_override || lead.email, name: lead.customer_name }],
                subject: `Your song for ${lead.recipient_name} is ready`,
                htmlContent: emailHtml,
                textContent: `Hi ${lead.customer_name},

Your personalized ${lead.occasion} song for ${lead.recipient_name} is ready.

Listen to your preview here: ${previewUrl}

We'd love for you to hear the full song — if you like the preview, you can unlock it directly from the page above.

Warmly,
Personal Song Gifts

---
Personal Song Gifts · 2108 N ST STE N, Sacramento, CA 95816

To unsubscribe: https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(lead.lead_email_override || lead.email)}
`,
                headers: {
                  "Message-ID": `<${lead.id}.${Date.now()}@personalsonggifts.com>`,
                  "X-Entity-Ref-ID": lead.id,
                  "Precedence": "transactional",
                  "List-Unsubscribe": `<mailto:support@personalsonggifts.com?subject=Unsubscribe>, <https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(lead.lead_email_override || lead.email)}>`,
                  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
                }
              }),
            });

            if (!emailResponse.ok) {
              const errorText = await emailResponse.text();
              console.error(`[PREVIEW] Email failed for lead ${lead.id}:`, errorText);
              leadPreviewResults.push({ leadId: lead.id, success: false, error: errorText });
              continue;
            }

            // Mark as sent
            await supabase
              .from("leads")
              .update({
                status: "preview_sent",
                preview_sent_at: now,
                sent_at: now,
                preview_scheduled_at: null,
              })
              .eq("id", lead.id)
              .is("preview_sent_at", null);

            console.log(`[PREVIEW] ✅ Lead ${lead.id} preview sent`);
            leadPreviewResults.push({ leadId: lead.id, success: true });
          } catch (leadError) {
            console.error(`[PREVIEW] Error for lead ${lead.id}:`, leadError);
            leadPreviewResults.push({
              leadId: lead.id,
              success: false,
              error: leadError instanceof Error ? leadError.message : "Unknown error",
            });
          }
        }
      }
    } catch (e) {
      console.error("[PREVIEW] Lead preview queue error:", e);
    }
    
    results.leadPreviews = leadPreviewResults;

    // ======= 7. SCHEDULED SMS QUEUE =======
    // Process SMS that were queued during quiet hours
    const scheduledSmsResults: Array<{ id: string; type: string; success: boolean; error?: string }> = [];
    
    try {
      // Process orders with scheduled SMS
      const { data: smsOrders } = await supabase
        .from("orders")
        .select("id, phone_e164, sms_opt_in, timezone, song_url, recipient_name")
        .eq("sms_status", "scheduled")
        .not("sms_scheduled_for", "is", null)
        .lte("sms_scheduled_for", now)
        .limit(10);

      for (const order of smsOrders || []) {
        try {
          if (!order.phone_e164 || !order.sms_opt_in || !order.song_url) continue;
          
          const shortId = order.id.slice(0, 8);
          const songLink = `https://personalsonggifts.lovable.app/song/${shortId}`;
          const smsText = `Your custom song is ready!\nListen here: ${songLink}\nReply STOP to opt out.`;
          
          const smsResult = await sendSms({
            to: order.phone_e164,
            text: smsText,
            tag: "order_delivery",
            timezone: order.timezone || undefined,
          });

          if (smsResult.sent) {
            await supabase.from("orders").update({
              sms_status: "sent",
              sms_sent_at: now,
              sms_scheduled_for: null,
            }).eq("id", order.id);
            scheduledSmsResults.push({ id: order.id, type: "order", success: true });
          } else if (smsResult.scheduled) {
            // Still in quiet hours, update scheduled time
            await supabase.from("orders").update({
              sms_scheduled_for: smsResult.scheduledFor,
            }).eq("id", order.id);
            scheduledSmsResults.push({ id: order.id, type: "order", success: false, error: "Still in quiet hours" });
          } else {
            await supabase.from("orders").update({
              sms_status: "failed",
              sms_last_error: smsResult.error?.substring(0, 500),
              sms_scheduled_for: null,
            }).eq("id", order.id);
            scheduledSmsResults.push({ id: order.id, type: "order", success: false, error: smsResult.error });
          }
        } catch (e) {
          console.error(`[SMS-QUEUE] Order ${order.id} error:`, e);
        }
      }

      // Process leads with scheduled SMS
      const { data: smsLeads } = await supabase
        .from("leads")
        .select("id, phone_e164, sms_opt_in, timezone, preview_token")
        .eq("sms_status", "scheduled")
        .not("sms_scheduled_for", "is", null)
        .lte("sms_scheduled_for", now)
        .limit(10);

      for (const lead of smsLeads || []) {
        try {
          if (!lead.phone_e164 || !lead.sms_opt_in || !lead.preview_token) continue;
          
          const previewLink = `https://personalsonggifts.lovable.app/preview/${lead.preview_token}`;
          const smsText = `We made your song preview!\nListen here: ${previewLink}\nReply STOP to opt out.`;
          
          const smsResult = await sendSms({
            to: lead.phone_e164,
            text: smsText,
            tag: "lead_preview",
            timezone: lead.timezone || undefined,
          });

          if (smsResult.sent) {
            await supabase.from("leads").update({
              sms_status: "sent",
              sms_sent_at: now,
              sms_scheduled_for: null,
            }).eq("id", lead.id);
            scheduledSmsResults.push({ id: lead.id, type: "lead", success: true });
          } else if (smsResult.scheduled) {
            await supabase.from("leads").update({
              sms_scheduled_for: smsResult.scheduledFor,
            }).eq("id", lead.id);
            scheduledSmsResults.push({ id: lead.id, type: "lead", success: false, error: "Still in quiet hours" });
          } else {
            await supabase.from("leads").update({
              sms_status: "failed",
              sms_last_error: smsResult.error?.substring(0, 500),
              sms_scheduled_for: null,
            }).eq("id", lead.id);
            scheduledSmsResults.push({ id: lead.id, type: "lead", success: false, error: smsResult.error });
          }
        } catch (e) {
          console.error(`[SMS-QUEUE] Lead ${lead.id} error:`, e);
        }
      }

      if (scheduledSmsResults.length > 0) {
        console.log(`[SMS-QUEUE] Processed ${scheduledSmsResults.length} scheduled SMS`);
      }
    } catch (e) {
      console.error("[SMS-QUEUE] Scheduled SMS queue error:", e);
    }

    results.scheduledSms = scheduledSmsResults;

    // ======= 8. UNPLAYED SONG RE-SEND QUEUE =======
    // For orders delivered 24h+ ago where the song page has never been played,
    // send a plain-text follow-up email (fires at most once per order).
    const unplayedResendResults: Array<{ orderId: string; success: boolean; error?: string }> = [];
    const MAX_UNPLAYED_RESENDS_PER_RUN = 5;

    try {
      const brevoApiKeyResend = Deno.env.get("BREVO_API_KEY");
      const senderEmailResend = "support@personalsonggifts.com";
      const senderNameResend = "Personal Song Gifts";

      if (!brevoApiKeyResend) {
        console.error("[RESEND] BREVO_API_KEY not configured");
      } else {
        // Get suppressed emails first
        const { data: suppressedEmails } = await supabase
          .from("email_suppressions")
          .select("email");
        const suppressedSet = new Set((suppressedEmails || []).map((s: { email: string }) => s.email.toLowerCase()));

        const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: unplayedOrders } = await supabase
          .from("orders")
          .select("id, customer_name, customer_email, customer_email_override, recipient_name, song_url, sent_at")
          .eq("status", "delivered")
          .eq("delivery_status", "sent")
          .not("song_url", "is", null)
          .is("song_played_at", null)
          .is("unplayed_resend_sent_at", null)
          .is("dismissed_at", null)
          .lte("sent_at", cutoff24h)
          .order("sent_at", { ascending: true })
          .limit(MAX_UNPLAYED_RESENDS_PER_RUN);

        console.log(`[RESEND] Found ${unplayedOrders?.length || 0} orders eligible for unplayed re-send`);

        for (const order of unplayedOrders || []) {
          try {
            const effectiveEmail = order.customer_email_override || order.customer_email;

            // Skip suppressed emails
            if (suppressedSet.has(effectiveEmail.toLowerCase())) {
              console.log(`[RESEND] Skipping suppressed email for order ${order.id}`);
              unplayedResendResults.push({ orderId: order.id, success: false, error: "Email suppressed" });
              continue;
            }

            const shortId = order.id.slice(0, 8).toUpperCase();
            const songLink = `https://personalsonggifts.lovable.app/song/${shortId}`;
            const firstName = order.customer_name?.split(" ")[0] || order.customer_name || "there";

            const resendHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: Arial, Helvetica, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <p style="font-size: 16px; line-height: 1.6; color: #222222; margin: 0 0 16px 0;">Hi ${firstName},</p>

    <p style="font-size: 16px; line-height: 1.6; color: #222222; margin: 0 0 16px 0;">
      We sent your song earlier, but it looks like it hasn't been played yet. We just want to make sure you have it in time for your special moment.
    </p>

    <p style="font-size: 16px; line-height: 1.6; color: #222222; margin: 0 0 8px 0;">You can listen to your song here:</p>
    <p style="font-size: 16px; line-height: 1.6; color: #222222; margin: 0 0 16px 0;">
      <a href="${songLink}" style="color: #1a73e8;">${songLink}</a>
    </p>

    <p style="font-size: 16px; line-height: 1.6; color: #222222; margin: 0 0 16px 0;">
      Thank you for letting us be part of something meaningful with you and your loved one.
    </p>

    <p style="font-size: 16px; line-height: 1.6; color: #222222; margin: 0 0 32px 0;">
      We truly hope you love it.
    </p>

    <p style="font-size: 16px; line-height: 1.6; color: #222222; margin: 0 0 32px 0;">
      Warmly,<br>
      Personal Song Gifts
    </p>

    <p style="font-size: 12px; color: #888888; margin: 0;">
      Personal Song Gifts &middot; 2108 N ST STE N, Sacramento, CA 95816<br>
      <a href="https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(effectiveEmail)}" style="color: #888888;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;

            const resendText = `Hi ${firstName},

We sent your song earlier, but it looks like it hasn't been played yet. We just want to make sure you have it in time for your special moment.

You can listen to your song here:
${songLink}

Thank you for letting us be part of something meaningful with you and your loved one.

We truly hope you love it.

Warmly,
Personal Song Gifts

---
Personal Song Gifts · 2108 N ST STE N, Sacramento, CA 95816

To unsubscribe: https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(effectiveEmail)}
`;

            const resendResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
              method: "POST",
              headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "api-key": brevoApiKeyResend,
              },
              body: JSON.stringify({
                sender: { name: senderNameResend, email: senderEmailResend },
                replyTo: { email: senderEmailResend, name: senderNameResend },
                to: [{ email: effectiveEmail, name: order.customer_name }],
                subject: `Did you get your song for ${order.recipient_name}?`,
                htmlContent: resendHtml,
                textContent: resendText,
                headers: {
                  "Message-ID": `<resend.${order.id}.${Date.now()}@personalsonggifts.com>`,
                  "X-Entity-Ref-ID": order.id,
                  "Precedence": "transactional",
                  "List-Unsubscribe": `<mailto:support@personalsonggifts.com?subject=Unsubscribe>, <https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(effectiveEmail)}>`,
                  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
                }
              }),
            });

            if (!resendResponse.ok) {
              const errorText = await resendResponse.text();
              console.error(`[RESEND] Email failed for order ${order.id}:`, errorText);
              unplayedResendResults.push({ orderId: order.id, success: false, error: errorText });
              continue;
            }

            // Mark re-send as sent (permanent lock — will never fire again for this order)
            await supabase
              .from("orders")
              .update({ unplayed_resend_sent_at: new Date().toISOString() })
              .eq("id", order.id);

            // Log to activity log for admin visibility
            try {
              await supabase.from("order_activity_log").insert({
                entity_type: "order",
                entity_id: order.id,
                event_type: "unplayed_resend_sent",
                actor: "system",
                details: `Unplayed re-send delivered to ${effectiveEmail}`,
              });
            } catch (_logErr) { /* never let logging break the flow */ }

            console.log(`[RESEND] ✅ Unplayed re-send sent for order ${order.id} → ${effectiveEmail}`);
            unplayedResendResults.push({ orderId: order.id, success: true });
          } catch (orderErr) {
            console.error(`[RESEND] Error for order ${order.id}:`, orderErr);
            unplayedResendResults.push({
              orderId: order.id,
              success: false,
              error: orderErr instanceof Error ? orderErr.message : "Unknown error",
            });
          }
        }

        if (unplayedResendResults.length > 0) {
          console.log(`[RESEND] Processed ${unplayedResendResults.length} unplayed re-sends`);
        }
      }
    } catch (e) {
      console.error("[RESEND] Unplayed re-send queue error:", e);
    }

    results.unplayedResends = unplayedResendResults;

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[SCHEDULER] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
