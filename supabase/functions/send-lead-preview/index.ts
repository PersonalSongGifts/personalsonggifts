import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
<body style="margin: 0; padding: 0; background-color: #FDF8F3; font-family: Georgia, 'Times New Roman', serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #1E3A5F 0%, #2C4A6E 100%); padding: 40px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="color: #FFFFFF; margin: 0; font-size: 28px; font-weight: normal;">Your Song for ${lead.recipient_name} is Ready</h1>
    </div>
    
    <div style="background-color: #FFFBF5; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <p style="color: #5D4E37; font-size: 18px; line-height: 1.6; margin-top: 0;">
        Hi ${lead.customer_name},
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        Great news! We have created a personalized ${lead.occasion} song for <strong>${lead.recipient_name}</strong>.
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        This is a short preview so you can hear a sample of the full song. Once you complete your purchase, you will receive the complete version.
      </p>
      
      <div style="text-align: center; margin: 40px 0;">
        <a href="${previewUrl}" style="display: inline-block; background: linear-gradient(135deg, #2E7D32 0%, #4CAF50 100%); color: #FFFFFF; text-decoration: none; padding: 18px 40px; font-size: 18px; border-radius: 30px; font-weight: bold; box-shadow: 0 4px 15px rgba(46, 125, 50, 0.3);">
          Listen to Your Preview
        </a>
      </div>
      
      <div style="background-color: #FFF8E7; border-left: 4px solid #FFA000; padding: 15px 20px; margin: 30px 0; border-radius: 0 8px 8px 0;">
        <p style="color: #5D4E37; margin: 0; font-size: 15px;">
          <strong>Special Offer:</strong> Complete your order today and save on the full song.
        </p>
      </div>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        This personalized song will make your gift truly memorable. We hope you love it!
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6; margin-bottom: 0;">
        Warm regards,<br>
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
        <a href="https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(lead.email)}" style="color: #999;">Unsubscribe from these emails</a>
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const textContent = `Your Song for ${lead.recipient_name} is Ready

Hi ${lead.customer_name},

Great news! We have created a personalized ${lead.occasion} song for ${lead.recipient_name}.

This is a short preview so you can hear a sample of the full song. Once you complete your purchase, you will receive the complete version.

Listen to your preview here: ${previewUrl}

Special Offer: Complete your order today and save on the full song.

This personalized song will make your gift truly memorable. We hope you love it!

Warm regards,
The Personal Song Gifts Team

---
Personal Song Gifts
2323 Music Row, Nashville, TN 37212
https://personalsonggifts.lovable.app

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
        subject: `Your song for ${lead.recipient_name} is ready to preview`,
        htmlContent: emailHtml,
        textContent: textContent,
        headers: {
          "Message-ID": messageId,
          "X-Entity-Ref-ID": lead.id,
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

    // Update lead with preview_sent_at
    await supabase
      .from("leads")
      .update({
        status: "preview_sent",
        preview_sent_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    const result = await response.json();
    console.log(`Preview email sent to ${lead.email}:`, result);

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
