import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ======= BACKGROUND AUTOMATION CONSTANTS =======
const MAX_GENERATIONS_PER_RUN = 3; // Rate limit: max 3 generations per minute
const MAX_LEAD_PREVIEWS_PER_RUN = 5; // Catch-up: max 5 overdue lead previews
const AUDIO_RECOVERY_AFTER_MINUTES = 5; // Recover stuck audio jobs after 5 min
const MAX_AUDIO_RECOVERIES_PER_RUN = 3;

// Compute hash of key input fields for change detection
async function computeInputsHash(fields: string[]): Promise<string> {
  const combined = fields.join('|');
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

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

        let generationsTriggered = 0;

        // Process ORDERS first (priority tier gets priority within orders)
        if (processOrders && generationsTriggered < MAX_GENERATIONS_PER_RUN) {
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
            .limit(MAX_GENERATIONS_PER_RUN - generationsTriggered);

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

        // Process LEADS (only remaining slots)
        if (processLeads && generationsTriggered < MAX_GENERATIONS_PER_RUN) {
          const { data: pendingLeads } = await supabase
            .from("leads")
            .select("id, quality_score")
            .is("automation_status", null)
            .not("earliest_generate_at", "is", null)
            .lte("earliest_generate_at", now)
            .is("dismissed_at", null)
            .neq("status", "converted")
            .or("next_attempt_at.is.null,next_attempt_at.lte." + now)
            .order("quality_score", { ascending: false }) // Higher quality first
            .order("earliest_generate_at", { ascending: true })
            .limit(MAX_GENERATIONS_PER_RUN - generationsTriggered);

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
              console.log(`[SCHEDULER] Triggering generation for lead ${lead.id} (score: ${lead.quality_score})`);
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

        results.generationsTriggered = generationsTriggered;
      } else {
        results.generationsTriggered = 0;
        results.automationDisabled = true;
      }
    } catch (e) {
      console.error("[SCHEDULER] Generation queue error:", e);
    }

    // ======= 3. ORDER DELIVERY QUEUE =======
    // Send delivery emails for orders where target_send_at has passed
    const orderDeliveryResults: Array<{ orderId: string; success: boolean; error?: string }> = [];
    
    try {
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
        .limit(10);

      console.log(`[DELIVERY] Found ${ordersToDeliver?.length || 0} orders ready for delivery`);

      for (const order of ordersToDeliver || []) {
        try {
          // Input hash validation - check if inputs changed after generation
          const currentHash = await computeInputsHash([
            order.recipient_name || "",
            order.special_qualities || "",
            order.favorite_memory || "",
            order.genre || "",
            order.occasion || "",
          ]);
          
          if (order.inputs_hash && currentHash !== order.inputs_hash) {
            console.log(`[DELIVERY] Order ${order.id} inputs changed, marking needs_review`);
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

          // Update status first (prevents duplicate processing)
          const { error: updateError } = await supabase
            .from("orders")
            .update({
              status: "delivered",
              delivered_at: now,
              sent_at: now,
              delivery_status: "sent",
            })
            .eq("id", order.id)
            .is("sent_at", null); // Optimistic lock

          if (updateError) throw updateError;

          // Send delivery email
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
                customerEmail: order.customer_email,
                customerName: order.customer_name,
                recipientName: order.recipient_name,
                occasion: order.occasion,
                songUrl: order.song_url,
              }),
            }
          );

          if (!emailResponse.ok) {
            const errorText = await emailResponse.text();
            console.error(`[DELIVERY] Email failed for order ${order.id}:`, errorText);
            orderDeliveryResults.push({ orderId: order.id, success: true, error: `Email failed: ${errorText}` });
          } else {
            console.log(`[DELIVERY] ✅ Order ${order.id} delivered`);
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
          const { error: updateError } = await supabase
            .from("orders")
            .update({
              status: "delivered",
              delivered_at: now,
              sent_at: now,
            })
            .eq("id", order.id)
            .eq("status", "ready");

          if (updateError) throw updateError;

          await fetch(`${supabaseUrl}/functions/v1/send-song-delivery`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              orderId: order.id,
              customerEmail: order.customer_email,
              customerName: order.customer_name,
              recipientName: order.recipient_name,
              occasion: order.occasion,
              songUrl: order.song_url,
            }),
          });

          legacyDeliveryResults.push({ orderId: order.id, success: true });
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
        .not("song_url", "is", null);

      for (const order of resendOrders || []) {
        try {
          await supabase
            .from("orders")
            .update({ resend_scheduled_at: null })
            .eq("id", order.id)
            .not("resend_scheduled_at", "is", null);

          await fetch(`${supabaseUrl}/functions/v1/send-song-delivery`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              orderId: order.id,
              customerEmail: order.customer_email,
              customerName: order.customer_name,
              recipientName: order.recipient_name,
              occasion: order.occasion,
              songUrl: order.song_url,
            }),
          });

          resendResults.push({ orderId: order.id, success: true });
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

            const previewUrl = `https://personalsonggifts.lovable.app/preview/${lead.preview_token}`;

            const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #FDF8F3; font-family: 'Georgia', serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #1E3A5F 0%, #2C4A6E 100%); padding: 40px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="color: #FFFFFF; margin: 0; font-size: 28px; font-weight: normal;">Your Song for ${lead.recipient_name} is Ready!</h1>
    </div>
    
    <div style="background-color: #FFFBF5; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <p style="color: #5D4E37; font-size: 18px; line-height: 1.6; margin-top: 0;">
        Hi ${lead.customer_name}!
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        Great news! We've created a beautiful personalized ${lead.occasion} song just for <strong>${lead.recipient_name}</strong>.
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        We're so excited for you to hear it! Listen to a preview below:
      </p>
      
      <div style="text-align: center; margin: 40px 0;">
        <a href="${previewUrl}" style="display: inline-block; background: linear-gradient(135deg, #2E7D32 0%, #4CAF50 100%); color: #FFFFFF; text-decoration: none; padding: 18px 40px; font-size: 18px; border-radius: 30px; font-weight: bold; box-shadow: 0 4px 15px rgba(46, 125, 50, 0.3);">
          Listen to Your Preview
        </a>
        <p style="text-align: center; margin-top: 15px; font-size: 13px; color: #666;">
          <strong>Can't see the button?</strong> Copy this link:<br>
          <a href="${previewUrl}" style="color: #1E3A5F; word-break: break-all; font-size: 12px;">
            ${previewUrl}
          </a>
        </p>
      </div>
      
      <div style="background-color: #FFF8E7; border-left: 4px solid #FFA000; padding: 15px 20px; margin: 30px 0; border-radius: 0 8px 8px 0;">
        <p style="color: #5D4E37; margin: 0; font-size: 15px;">
          <strong>50% Off Today!</strong><br>
          Complete your order now and get instant access to the full song.
        </p>
      </div>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6; margin-bottom: 0;">
        With love and music,<br>
        <strong style="color: #1E3A5F;">The Personal Song Gifts Team</strong>
      </p>
    </div>
    
    <div style="text-align: center; padding: 20px;">
      <p style="color: #6B7B8C; font-size: 12px; margin: 0;">
        Personal Song Gifts<br>
        2323 Music Row, Nashville, TN 37212<br>
        <a href="https://personalsonggifts.lovable.app" style="color: #1E3A5F;">personalsonggifts.com</a>
      </p>
      <p style="color: #999; font-size: 11px; margin-top: 10px;">
        <a href="https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(lead.email)}" style="color: #999;">Unsubscribe</a>
      </p>
    </div>
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
                to: [{ email: lead.email, name: lead.customer_name }],
                subject: `Your song for ${lead.recipient_name} is ready`,
                htmlContent: emailHtml,
                textContent: `Your Song for ${lead.recipient_name} is Ready!

Hi ${lead.customer_name}!

Great news! We've created a beautiful personalized ${lead.occasion} song just for ${lead.recipient_name}.

We're so excited for you to hear it! Listen to a preview here: ${previewUrl}

50% Off Today!
Complete your order now and get instant access to the full song.

With love and music,
The Personal Song Gifts Team

---
Personal Song Gifts
2323 Music Row, Nashville, TN 37212
https://personalsonggifts.lovable.app

To unsubscribe: https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(lead.email)}
`,
                headers: {
                  "Message-ID": `<${lead.id}.${Date.now()}@personalsonggifts.com>`,
                  "X-Entity-Ref-ID": lead.id,
                  "X-Priority": "1",
                  "Precedence": "transactional",
                  "List-Unsubscribe": `<mailto:support@personalsonggifts.com?subject=Unsubscribe>, <https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(lead.email)}>`,
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
