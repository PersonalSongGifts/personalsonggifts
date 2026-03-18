import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { leadMatchesOrder } from "../_shared/lead-order-matching.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

interface SendFollowupRequest {
  leadId: string;
  adminPassword: string;
  resend?: boolean;  // If true, allows resending even if follow-up was already sent
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

    const { leadId, adminPassword: providedPassword, resend }: SendFollowupRequest = await req.json();

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
        JSON.stringify({ error: "Lead already converted - no follow-up needed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Purchase guard: only auto-convert if this exact lead already became an order after capture
    const { data: candidateOrders } = await supabase
      .from("orders")
      .select("id, created_at, customer_email, recipient_name, recipient_type, occasion, genre, singer_preference, special_qualities, favorite_memory, special_message, lyrics_language_code")
      .ilike("customer_email", lead.email)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(20);

    const matchedOrder = (candidateOrders || []).find((order) =>
      new Date(order.created_at).getTime() >= new Date(lead.captured_at).getTime() && leadMatchesOrder(lead, order)
    );

    if (matchedOrder) {
      console.log(`Lead ${lead.id} already converted to matching order ${matchedOrder.id}`);
      await supabase.from("leads")
        .update({ status: "converted", converted_at: new Date().toISOString(), order_id: matchedOrder.id })
        .eq("id", lead.id);
      return new Response(
        JSON.stringify({ error: "Lead already converted to matching purchase", orderId: matchedOrder.id }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!lead.preview_sent_at) {
      return new Response(
        JSON.stringify({ error: "Preview not sent yet - send preview first" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if follow-up already sent (unless resend=true)
    if (lead.follow_up_sent_at && !resend) {
      return new Response(
        JSON.stringify({ error: "Follow-up already sent. Use resend option to send again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send follow-up email via Brevo
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = "support@personalsonggifts.com";
    const senderName = "Personal Song Gifts";

    if (!brevoApiKey) {
      throw new Error("BREVO_API_KEY not configured");
    }

    const previewUrl = `https://personalsonggifts.lovable.app/preview/${lead.preview_token}?followup=true`;
    const messageId = `<${lead.id}.followup.${Date.now()}@personalsonggifts.com>`;

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
      Just wanted to check in — your ${lead.occasion} song for ${lead.recipient_name} is still waiting for you.
    </p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      You can listen to the preview and complete your order here:
    </p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
      <a href="${previewUrl}" style="color: #1E3A5F;">${previewUrl}</a>
    </p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Use code <strong>FULLSONG</strong> at checkout to save $5 on your order.
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

Just wanted to check in — your ${lead.occasion} song for ${lead.recipient_name} is still waiting for you.

You can listen to the preview and complete your order here: ${previewUrl}

Use code FULLSONG at checkout to save $5 on your order.

— The Personal Song Gifts Team

---
Personal Song Gifts
2108 N ST STE N, SACRAMENTO, CA 95816

To unsubscribe: https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(lead.email)}
`;

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
        to: [{ email: lead.email, name: lead.customer_name }],
        subject: `Your song for ${lead.recipient_name} is still waiting`,
        htmlContent: emailHtml,
        textContent: textContent,
        headers: {
          "Message-ID": messageId,
          "X-Entity-Ref-ID": lead.id,
          "Precedence": "transactional",
          "List-Unsubscribe": `<mailto:support@personalsonggifts.com?subject=Unsubscribe>, <https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(lead.email)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
        }
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Brevo API error:", errorData);
      throw new Error(`Failed to send email: ${response.status}`);
    }

    // Update lead with follow_up_sent_at
    await supabase
      .from("leads")
      .update({
        follow_up_sent_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    const result = await response.json();
    console.log(`Follow-up email sent to ${lead.email}:`, result);

    return new Response(
      JSON.stringify({ success: true, messageId: result.messageId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send lead follow-up error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
