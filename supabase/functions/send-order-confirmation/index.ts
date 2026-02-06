const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrderConfirmationRequest {
  orderId: string;
  customerEmail: string;
  customerName: string;
  recipientName: string;
  occasion: string;
  genre: string;
  pricingTier: string;
  expectedDelivery: string;
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
      genre,
      pricingTier,
      expectedDelivery,
    }: OrderConfirmationRequest = await req.json();

    if (!customerEmail || !orderId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tierLabel = pricingTier === "priority" ? "Priority (24-hour)" : "Standard (48-hour)";
    const deliveryDate = new Date(expectedDelivery).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "America/New_York",
    });

    const messageId = `<${orderId}.${Date.now()}@personalsonggifts.com>`;

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
      <h1 style="color: #FDF8F3; margin: 0; font-size: 32px; font-weight: normal;">Order Confirmed!</h1>
    </div>
    
    <div style="background-color: #FFFBF5; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <p style="color: #5D4E37; font-size: 18px; line-height: 1.6; margin-top: 0;">
        Dear ${customerName || "Valued Customer"},
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        We're thrilled! Thank you for your order. We can't wait to create a personalized song for <strong>${recipientName}</strong>. Our team is already getting started!
      </p>
      
      <div style="background-color: #F5F8FB; border-left: 4px solid #1E3A5F; padding: 20px; margin: 30px 0; border-radius: 0 8px 8px 0;">
        <h2 style="color: #1E3A5F; margin: 0 0 15px 0; font-size: 18px;">Order Details</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;"><strong>Order ID:</strong></td>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;">${orderId.slice(0, 8).toUpperCase()}</td>
          </tr>
          <tr>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;"><strong>For:</strong></td>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;">${recipientName}</td>
          </tr>
          <tr>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;"><strong>Occasion:</strong></td>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;">${occasion}</td>
          </tr>
          <tr>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;"><strong>Genre:</strong></td>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;">${genre}</td>
          </tr>
          <tr>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;"><strong>Delivery:</strong></td>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;">${tierLabel}</td>
          </tr>
        </table>
      </div>
      
      <div style="background-color: #EEF3F8; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
        <p style="color: #1E3A5F; margin: 0; font-size: 14px;">
          <strong>Expected Delivery:</strong><br>
          <span style="font-size: 16px;">by ${deliveryDate}</span>
        </p>
      </div>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        We will email you as soon as your song is ready. If you have any questions, just reply to this email!
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6; margin-bottom: 0;">
        Warm regards,<br>
        <strong style="color: #1E3A5F;">The Personal Song Gifts Team</strong>
      </p>
    </div>
    
    <div style="text-align: center; padding: 20px;">
      <p style="color: #6B7B8C; font-size: 12px; margin: 0;">
        Personal Song Gifts<br>
        2108 N ST STE N, SACRAMENTO, CA 95816<br>
        <a href="https://personalsonggifts.lovable.app" style="color: #1E3A5F;">personalsonggifts.com</a>
      </p>
      <p style="color: #999; font-size: 11px; margin-top: 10px;">
        <a href="https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(customerEmail)}" style="color: #999;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>
    `;

const textContent = `Order Confirmed!

Dear ${customerName || "Valued Customer"},

We're thrilled! Thank you for your order. We can't wait to create a personalized song for ${recipientName}. Our team is already getting started!

Order Details:
- Order ID: ${orderId.slice(0, 8).toUpperCase()}
- For: ${recipientName}
- Occasion: ${occasion}
- Genre: ${genre}
- Delivery: ${tierLabel}

Expected Delivery: by ${deliveryDate}

We will email you as soon as your song is ready. If you have any questions, just reply to this email!

Warm regards,
The Personal Song Gifts Team

---
Personal Song Gifts
2108 N ST STE N, SACRAMENTO, CA 95816
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
        subject: `Order confirmed - ${recipientName}'s song is being created`,
        htmlContent: emailHtml,
        textContent: textContent,
        headers: {
          "Message-ID": messageId,
          "X-Entity-Ref-ID": orderId,
          "X-Priority": "1",
          "Precedence": "transactional",
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
    console.log("Order confirmation email sent:", result);

    return new Response(
      JSON.stringify({ success: true, messageId: result.messageId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Send order confirmation error:", error);
    const message = error instanceof Error ? error.message : "Failed to send email";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
