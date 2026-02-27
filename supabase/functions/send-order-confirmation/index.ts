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
  revisionToken?: string;
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
      revisionToken,
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
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: Arial, Helvetica, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <p style="color: #1E3A5F; font-size: 22px; font-weight: bold; margin: 0 0 30px 0;">Order Confirmed</p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Dear ${customerName || "Valued Customer"},
    </p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Thank you for your order! We're creating a personalized ${occasion} song for <strong>${recipientName}</strong> and our team is already getting started.
    </p>

    <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
      <tr style="border-bottom: 1px solid #eeeeee;">
        <td style="color: #555555; padding: 10px 0; font-size: 14px; width: 40%;"><strong>Order ID</strong></td>
        <td style="color: #333333; padding: 10px 0; font-size: 14px;">${orderId.slice(0, 8).toUpperCase()}</td>
      </tr>
      <tr style="border-bottom: 1px solid #eeeeee;">
        <td style="color: #555555; padding: 10px 0; font-size: 14px;"><strong>Song for</strong></td>
        <td style="color: #333333; padding: 10px 0; font-size: 14px;">${recipientName}</td>
      </tr>
      <tr style="border-bottom: 1px solid #eeeeee;">
        <td style="color: #555555; padding: 10px 0; font-size: 14px;"><strong>Occasion</strong></td>
        <td style="color: #333333; padding: 10px 0; font-size: 14px;">${occasion}</td>
      </tr>
      <tr style="border-bottom: 1px solid #eeeeee;">
        <td style="color: #555555; padding: 10px 0; font-size: 14px;"><strong>Genre</strong></td>
        <td style="color: #333333; padding: 10px 0; font-size: 14px;">${genre}</td>
      </tr>
      <tr>
        <td style="color: #555555; padding: 10px 0; font-size: 14px;"><strong>Delivery</strong></td>
        <td style="color: #333333; padding: 10px 0; font-size: 14px;">${tierLabel} — by ${deliveryDate}</td>
      </tr>
    </table>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      We'll email you as soon as your song is ready. If you have any questions, just reply to this email.
    </p>

    ${revisionToken ? `<p style="color: #555555; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
      <strong>Need to make changes?</strong> You can update your song details anytime before delivery:
      <a href="https://personalsonggifts.lovable.app/song/revision/${revisionToken}" style="color: #1E3A5F;">Update your order</a>
    </p>` : ''}

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 40px 0;">
      Warm regards,<br>
      The Personal Song Gifts Team
    </p>

    <hr style="border: none; border-top: 1px solid #eeeeee; margin: 0 0 20px 0;">
    <p style="color: #999999; font-size: 12px; margin: 0 0 6px 0;">
      Personal Song Gifts &bull; 2108 N ST STE N, SACRAMENTO, CA 95816
    </p>
    <p style="color: #999999; font-size: 12px; margin: 0;">
      <a href="https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(customerEmail)}" style="color: #999999;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
    `;

const textContent = `Order Confirmed

Dear ${customerName || "Valued Customer"},

Thank you for your order! We're creating a personalized ${occasion} song for ${recipientName} and our team is already getting started.

Order ID: ${orderId.slice(0, 8).toUpperCase()}
Song for: ${recipientName}
Occasion: ${occasion}
Genre: ${genre}
Delivery: ${tierLabel} — by ${deliveryDate}

We'll email you as soon as your song is ready. If you have any questions, just reply to this email.
${revisionToken ? `\nNeed to make changes? Update your order: https://personalsonggifts.lovable.app/song/revision/${revisionToken}\n` : ''}
Warm regards,
The Personal Song Gifts Team

---
Personal Song Gifts
2108 N ST STE N, SACRAMENTO, CA 95816

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
