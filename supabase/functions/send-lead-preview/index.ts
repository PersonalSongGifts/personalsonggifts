import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { sendSms } from "../_shared/brevo-sms.ts";
import { logActivity } from "../_shared/activity-log.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

interface SendPreviewRequest {
  leadId: string;
  adminPassword: string;
  resend?: boolean;  // If true, allows resending even if preview was already sent
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    if (!adminPassword) {
      throw new Error("ADMIN_PASSWORD not configured");
    }

    const { leadId, adminPassword: providedPassword, resend }: SendPreviewRequest = await req.json();

    if (!providedPassword || providedPassword.trim() !== adminPassword.trim()) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!leadId) {
      return new Response(
        JSON.stringify({ error: "Lead ID required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get lead data
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (lead.status === "converted") {
      return new Response(
        JSON.stringify({ error: "Lead already converted" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
      console.log(`Lead ${lead.id} has paid order ${existingOrder.id}, auto-converting`);
      await supabase.from("leads")
        .update({ status: "converted", converted_at: new Date().toISOString(), order_id: existingOrder.id })
        .eq("id", lead.id);
      return new Response(
        JSON.stringify({ error: "Lead auto-converted: customer already paid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if preview already sent (unless resend=true)
    if (lead.preview_sent_at && !resend) {
      return new Response(
        JSON.stringify({ error: "Preview already sent. Use resend option to send again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!lead.preview_song_url || !lead.preview_token) {
      return new Response(
        JSON.stringify({ error: "Preview not ready - upload song first" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send preview email via Brevo
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = "support@personalsonggifts.com";
    const senderName = "Personal Song Gifts";

    if (!brevoApiKey) {
      throw new Error("BREVO_API_KEY not configured");
    }

    const previewUrl = `https://personalsonggifts.lovable.app/preview/${lead.preview_token}`;
    const messageId = `<${lead.id}.${Date.now()}@personalsonggifts.com>`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: Arial, Helvetica, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Hi ${lead.customer_name},</p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      We created a personalized ${lead.occasion} song for ${lead.recipient_name} and wanted you to hear it first.
    </p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      This is a short preview. Once you complete your purchase, you'll receive the full song.
    </p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;">
      <strong>Listen to the preview:</strong>
    </p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
      <a href="${previewUrl}" style="color: #1E3A5F;">${previewUrl}</a>
    </p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 40px 0;">
      — The Personal Song Gifts Team
    </p>

    <hr style="border: none; border-top: 1px solid #eeeeee; margin: 0 0 20px 0;">
    <p style="color: #999999; font-size: 12px; margin: 0 0 6px 0;">
      Personal Song Gifts &bull; 2108 N ST STE N, SACRAMENTO, CA 95816
    </p>
    <p style="color: #999999; font-size: 12px; margin: 0;">
      <a href="https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(lead.email)}" style="color: #999999;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
    `;

    const textContent = `Hi ${lead.customer_name},

We created a personalized ${lead.occasion} song for ${lead.recipient_name} and wanted you to hear it first.

This is a short preview. Once you complete your purchase, you'll receive the full song.

Listen to the preview here: ${previewUrl}

— The Personal Song Gifts Team

---
Personal Song Gifts
2108 N ST STE N, SACRAMENTO, CA 95816

To unsubscribe: https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(lead.email)}
`;

    // Compute effective email recipients
    const effectiveEmail = (lead.lead_email_override?.trim() || lead.email).toLowerCase();
    const ccEmail = lead.lead_email_cc?.trim()?.toLowerCase();
    const recipients = [effectiveEmail];
    if (ccEmail && ccEmail !== effectiveEmail) {
      recipients.push(ccEmail);
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "api-key": brevoApiKey,
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        replyTo: { email: senderEmail, name: senderName },
        to: [{ email: effectiveEmail, name: lead.customer_name }],
        ...(ccEmail && ccEmail !== effectiveEmail ? { cc: [{ email: ccEmail }] } : {}),
        subject: `Your song for ${lead.recipient_name} is ready`,
        htmlContent: emailHtml,
        textContent: textContent,
        headers: {
          "Message-ID": messageId,
          "X-Entity-Ref-ID": lead.id,
          "Precedence": "transactional",
          "List-Unsubscribe": `<mailto:support@personalsonggifts.com?subject=Unsubscribe>, <https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(effectiveEmail)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
        }
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Brevo API error:", errorData);
      throw new Error(`Failed to send email: ${response.status}`);
    }

    // Update lead with preview_sent_at and track sent recipients
    const existingSentTo = (lead.preview_sent_to_emails as string[] | null) || [];
    const newSentTo = [...new Set([...existingSentTo, ...recipients])];
    
    await supabase
      .from("leads")
      .update({
        status: "preview_sent",
        preview_sent_at: new Date().toISOString(),
        preview_sent_to_emails: newSentTo,
      })
      .eq("id", leadId);

    const result = await response.json();
    console.log(`Preview email sent to ${recipients.join(", ")}:`, result);

    await logActivity(supabase, "lead", leadId, "delivery_sent", "system", `Preview email sent to ${recipients.join(", ")}`);

    // === SMS DELIVERY (after email success) ===
    try {
      if (lead.sms_opt_in === true && lead.phone_e164 && lead.sms_status !== "sent") {
        const previewSmsLink = `https://personalsonggifts.lovable.app/preview/${lead.preview_token}`;
        
        // ASSERTION: Lead SMS must contain /preview/ path, never /song/
        const smsText = `We made your song preview!\nListen here: ${previewSmsLink}\nReply STOP to opt out.`;
        if (smsText.includes("/song/")) {
          console.error("[SMS] ASSERTION FAILED: Lead SMS contains /song/ link!");
        } else {
          const smsResult = await sendSms({
            to: lead.phone_e164,
            text: smsText,
            tag: "lead_preview",
            timezone: lead.timezone || undefined,
          });
          console.log("[SMS] Lead preview SMS result:", JSON.stringify(smsResult));

          // Update lead SMS status
          const smsUpdate: Record<string, unknown> = {};
          if (smsResult.sent) {
            smsUpdate.sms_status = "sent";
            smsUpdate.sms_sent_at = new Date().toISOString();
          } else if (smsResult.scheduled) {
            smsUpdate.sms_status = "scheduled";
            smsUpdate.sms_scheduled_for = smsResult.scheduledFor;
          } else if (smsResult.error) {
            smsUpdate.sms_status = "failed";
            smsUpdate.sms_last_error = smsResult.error.substring(0, 500);
          }

          if (Object.keys(smsUpdate).length > 0) {
            await supabase.from("leads").update(smsUpdate).eq("id", leadId);
          }
        }
      }
    } catch (smsError) {
      // SMS errors must NEVER block the response
      console.error("[SMS] Lead preview SMS error (non-blocking):", smsError);
    }

    return new Response(
      JSON.stringify({ success: true, messageId: result.messageId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send lead preview error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
