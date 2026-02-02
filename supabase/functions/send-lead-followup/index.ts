import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

interface SendFollowupRequest {
  leadId: string;
  adminPassword: string;
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

    const { leadId, adminPassword: providedPassword }: SendFollowupRequest = await req.json();

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

    if (!lead.preview_sent_at) {
      return new Response(
        JSON.stringify({ error: "Preview not sent yet - send preview first" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (lead.follow_up_sent_at) {
      return new Response(
        JSON.stringify({ error: "Follow-up already sent" }),
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
      <h1 style="color: #FFFFFF; margin: 0; font-size: 28px; font-weight: normal;">A special offer for ${lead.recipient_name}'s song</h1>
    </div>
    
    <div style="background-color: #FFFBF5; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <p style="color: #5D4E37; font-size: 18px; line-height: 1.6; margin-top: 0;">
        Hi ${lead.customer_name}!
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        We noticed you listened to your preview but haven't completed your order yet. We totally get it – sometimes we need a little more time to decide!
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        So here's a little something to help: <strong>Use code FULLSONG for an extra $5 off</strong> your order (on top of the 50% discount already applied)!
      </p>
      
      <div style="background-color: #FFF3E0; border: 2px dashed #FF9800; padding: 20px; margin: 30px 0; border-radius: 8px; text-align: center;">
        <p style="color: #E65100; margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Your Exclusive Code</p>
        <p style="color: #E65100; margin: 10px 0 0 0; font-size: 32px; font-weight: bold; letter-spacing: 3px;">FULLSONG</p>
        <p style="color: #795548; margin: 10px 0 0 0; font-size: 14px;">Saves you an extra $5!</p>
      </div>
      
      <div style="text-align: center; margin: 40px 0;">
        <a href="${previewUrl}" style="display: inline-block; background: linear-gradient(135deg, #2E7D32 0%, #4CAF50 100%); color: #FFFFFF; text-decoration: none; padding: 18px 40px; font-size: 18px; border-radius: 30px; font-weight: bold; box-shadow: 0 4px 15px rgba(46, 125, 50, 0.3);">
          Listen Again & Complete Order
        </a>
      </div>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        Your personalized ${lead.occasion} song for <strong>${lead.recipient_name}</strong> is waiting for you. Don't let this special moment slip away!
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6; margin-bottom: 0;">
        With love and music,<br>
        <strong style="color: #1E3A5F;">The Personal Song Gifts Team</strong>
      </p>
    </div>
    
    <div style="text-align: center; padding: 20px;">
      <p style="color: #6B7B8C; font-size: 12px; margin: 0;">
        © 2026 Personal Song Gifts<br>
        123 Music Lane, Nashville, TN 37203<br>
        <a href="https://personalsonggifts.lovable.app" style="color: #1E3A5F;">personalsonggifts.com</a>
      </p>
      <p style="color: #999; font-size: 11px; margin-top: 10px;">
        <a href="https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(lead.email)}" style="color: #999;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const textContent = `A special offer for ${lead.recipient_name}'s song

Hi ${lead.customer_name}!

We noticed you listened to your preview but haven't completed your order yet. We totally get it – sometimes we need a little more time to decide!

So here's a little something to help: Use code FULLSONG for an extra $5 off your order (on top of the 50% discount already applied)!

Your Exclusive Code: FULLSONG
Saves you an extra $5!

Listen again and complete your order: ${previewUrl}

Your personalized ${lead.occasion} song for ${lead.recipient_name} is waiting for you. Don't let this special moment slip away!

With love and music,
The Personal Song Gifts Team

---
Personal Song Gifts
123 Music Lane, Nashville, TN 37203
https://personalsonggifts.lovable.app

Unsubscribe: https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(lead.email)}
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
        subject: `A special offer for ${lead.recipient_name}'s song`,
        htmlContent: emailHtml,
        textContent: textContent,
        headers: {
          "List-Unsubscribe": `<mailto:unsubscribe@personalsonggifts.com?subject=Unsubscribe>, <https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(lead.email)}>`,
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
