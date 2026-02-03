const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SongDeliveryRequest {
  orderId: string;
  customerEmail: string;
  customerName: string;
  recipientName: string;
  occasion: string;
  songUrl: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = "support@personalsonggifts.com";
    const senderName = "Personal Song Gifts";
    
    if (!brevoApiKey) {
      throw new Error("BREVO_API_KEY not configured");
    }

    const {
      orderId,
      customerEmail,
      customerName,
      recipientName,
      occasion,
      songUrl,
    }: SongDeliveryRequest = await req.json();

    if (!customerEmail || !orderId || !songUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const messageId = `<${orderId}.delivery.${Date.now()}@personalsonggifts.com>`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #FDF8F3; font-family: Georgia, 'Times New Roman', serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #2E7D32 0%, #4CAF50 100%); padding: 40px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="color: #FFFFFF; margin: 0; font-size: 32px; font-weight: normal;">${recipientName}'s song is complete</h1>
    </div>
    
    <div style="background-color: #FFFBF5; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <p style="color: #5D4E37; font-size: 18px; line-height: 1.6; margin-top: 0;">
        Dear ${customerName || "Valued Customer"},
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        Great news! Your personalized ${occasion} song for <strong>${recipientName}</strong> is complete and ready to share.
      </p>
      
      <div style="text-align: center; margin: 40px 0;">
        <a href="https://personalsonggifts.lovable.app/song/${orderId.slice(0, 8)}" style="display: inline-block; background: linear-gradient(135deg, #1E3A5F 0%, #2C4A6E 100%); color: #FDF8F3; text-decoration: none; padding: 18px 40px; font-size: 18px; border-radius: 30px; font-weight: bold; box-shadow: 0 4px 15px rgba(30, 58, 95, 0.3);">
          Listen to Your Song
        </a>
      </div>
      
      <div style="background-color: #F5F8FB; border-radius: 8px; padding: 20px; margin: 30px 0;">
        <h3 style="color: #1E3A5F; margin: 0 0 10px 0; font-size: 16px;">Ways to Share</h3>
        <ul style="color: #5D4E37; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
          <li>Play it at your next celebration or gathering</li>
          <li>Send the link directly via text or messaging apps</li>
          <li>Download and save it forever</li>
          <li>Share on social media</li>
        </ul>
      </div>
      
      <div style="background-color: #EEF3F8; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
        <p style="color: #1E3A5F; margin: 0; font-size: 14px;">
          <strong>Order ID:</strong> ${orderId.slice(0, 8).toUpperCase()}
        </p>
      </div>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        We hope this song brings joy and unforgettable memories. If you love it, we would be honored if you shared your experience with friends and family.
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
        <a href="https://personalsonggifts.lovable.app" style="color: #1E3A5F;">Order another song</a>
      </p>
      <p style="color: #999; font-size: 11px; margin-top: 10px;">
        <a href="https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(customerEmail)}" style="color: #999;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const textContent = `${recipientName}'s song is complete and ready to share

Dear ${customerName || "Valued Customer"},

Great news! Your personalized ${occasion} song for ${recipientName} is complete and ready to share.

Listen to your song here: https://personalsonggifts.lovable.app/song/${orderId.slice(0, 8)}

Ways to Share:
- Play it at your next celebration or gathering
- Send the link directly via text or messaging apps
- Download and save it forever
- Share on social media

Order ID: ${orderId.slice(0, 8).toUpperCase()}

We hope this song brings joy and unforgettable memories. If you love it, we would be honored if you shared your experience with friends and family.

Warm regards,
The Personal Song Gifts Team

---
Personal Song Gifts
2323 Music Row, Nashville, TN 37212
https://personalsonggifts.lovable.app

To unsubscribe: https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(customerEmail)}
`;

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "api-key": brevoApiKey,
      },
      body: JSON.stringify({
        sender: {
          name: senderName,
          email: senderEmail,
        },
        replyTo: {
          email: senderEmail,
          name: senderName,
        },
        to: [{ email: customerEmail, name: customerName || customerEmail }],
        subject: `${recipientName}'s song is complete and ready to share`,
        htmlContent: emailHtml,
        textContent: textContent,
        headers: {
          "Message-ID": messageId,
          "X-Entity-Ref-ID": orderId,
          "List-Unsubscribe": `<mailto:support@personalsonggifts.com?subject=Unsubscribe>, <https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(customerEmail)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
        }
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Brevo API error:", errorData);
      throw new Error(`Failed to send email: ${response.status}`);
    }

    const result = await response.json();
    console.log("Song delivery email sent:", result);

    return new Response(
      JSON.stringify({ success: true, messageId: result.messageId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Send song delivery error:", error);
    const message = error instanceof Error ? error.message : "Failed to send email";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
