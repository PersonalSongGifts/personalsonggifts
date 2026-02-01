const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendTestEmailRequest {
  email: string;
  template: "lead_preview" | "lead_followup" | "order_confirmation" | "song_delivery";
  adminPassword: string;
}

// Sample data for test emails
const sampleData = {
  customerName: "Test Customer",
  recipientName: "Test Recipient",
  occasion: "Birthday",
  genre: "Acoustic Pop",
  previewToken: "demo",
  orderId: "TEST12345",
  songUrl: "https://personalsonggifts.lovable.app/song/demo",
};

function getLeadPreviewHtml(previewUrl: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #FDF8F3; font-family: 'Georgia', serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #1E3A5F 0%, #2C4A6E 100%); padding: 40px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="color: #FFFFFF; margin: 0; font-size: 28px; font-weight: normal;">🎵 Your Song for ${sampleData.recipientName} is Ready!</h1>
    </div>
    
    <div style="background-color: #FFFBF5; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <p style="color: #5D4E37; font-size: 18px; line-height: 1.6; margin-top: 0;">
        Hi ${sampleData.customerName}!
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        Great news! We've created a beautiful personalized ${sampleData.occasion} song just for <strong>${sampleData.recipientName}</strong>.
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        We're so excited for you to hear it! Listen to a preview below:
      </p>
      
      <div style="text-align: center; margin: 40px 0;">
        <a href="${previewUrl}" style="display: inline-block; background: linear-gradient(135deg, #2E7D32 0%, #4CAF50 100%); color: #FFFFFF; text-decoration: none; padding: 18px 40px; font-size: 18px; border-radius: 30px; font-weight: bold; box-shadow: 0 4px 15px rgba(46, 125, 50, 0.3);">
          🎧 Listen to Your Preview
        </a>
      </div>
      
      <div style="background-color: #FFF8E7; border-left: 4px solid #FFA000; padding: 15px 20px; margin: 30px 0; border-radius: 0 8px 8px 0;">
        <p style="color: #5D4E37; margin: 0; font-size: 15px;">
          <strong>💘 50% Off Today!</strong><br>
          Complete your order now and get instant access to the full song.
        </p>
      </div>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        This personalized song will make your gift truly unforgettable. Don't miss out on this special moment!
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6; margin-bottom: 0;">
        With love and music,<br>
        <strong style="color: #1E3A5F;">The Personal Song Gifts Team</strong> 🎶
      </p>
    </div>
    
    <div style="text-align: center; padding: 20px;">
      <p style="color: #6B7B8C; font-size: 12px; margin: 0;">
        © 2026 Personal Song Gifts. Made with ❤️<br>
        <a href="https://personalsonggifts.lovable.app" style="color: #1E3A5F;">personalsonggifts.com</a>
      </p>
      <p style="color: #999; font-size: 11px; margin-top: 10px;">
        ⚠️ This is a TEST EMAIL sent from the Admin Dashboard
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

function getLeadFollowupHtml(previewUrl: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #FDF8F3; font-family: 'Georgia', serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #1E3A5F 0%, #2C4A6E 100%); padding: 40px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="color: #FFFFFF; margin: 0; font-size: 28px; font-weight: normal;">🎁 Special Offer: $5 Off Your Song!</h1>
    </div>
    
    <div style="background-color: #FFFBF5; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <p style="color: #5D4E37; font-size: 18px; line-height: 1.6; margin-top: 0;">
        Hi ${sampleData.customerName}!
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        We noticed you haven't completed your order for ${sampleData.recipientName}'s personalized ${sampleData.occasion} song yet.
      </p>
      
      <div style="background-color: #E8F5E9; border: 2px dashed #4CAF50; padding: 20px; margin: 30px 0; border-radius: 8px; text-align: center;">
        <p style="color: #2E7D32; margin: 0; font-size: 20px; font-weight: bold;">
          🎉 Use code: SAVE5
        </p>
        <p style="color: #5D4E37; margin: 10px 0 0 0; font-size: 14px;">
          Get $5 off your order today!
        </p>
      </div>
      
      <div style="text-align: center; margin: 40px 0;">
        <a href="${previewUrl}" style="display: inline-block; background: linear-gradient(135deg, #2E7D32 0%, #4CAF50 100%); color: #FFFFFF; text-decoration: none; padding: 18px 40px; font-size: 18px; border-radius: 30px; font-weight: bold; box-shadow: 0 4px 15px rgba(46, 125, 50, 0.3);">
          🎧 Listen Again & Complete Order
        </a>
      </div>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6; margin-bottom: 0;">
        With love and music,<br>
        <strong style="color: #1E3A5F;">The Personal Song Gifts Team</strong> 🎶
      </p>
    </div>
    
    <div style="text-align: center; padding: 20px;">
      <p style="color: #6B7B8C; font-size: 12px; margin: 0;">
        © 2026 Personal Song Gifts. Made with ❤️
      </p>
      <p style="color: #999; font-size: 11px; margin-top: 10px;">
        ⚠️ This is a TEST EMAIL sent from the Admin Dashboard
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

function getOrderConfirmationHtml() {
  const tierLabel = "Priority (24-hour)";
  const deliveryDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #FDF8F3; font-family: 'Georgia', serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #1E3A5F 0%, #2C4A6E 100%); padding: 40px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="color: #FDF8F3; margin: 0; font-size: 32px; font-weight: normal;">🎵 Order Confirmed!</h1>
    </div>
    
    <div style="background-color: #FFFBF5; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <p style="color: #5D4E37; font-size: 18px; line-height: 1.6; margin-top: 0;">
        Dear ${sampleData.customerName},
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        Thank you for your order! We're thrilled to create a personalized song for ${sampleData.recipientName}. Our talented musicians are already getting inspired.
      </p>
      
      <div style="background-color: #F5F8FB; border-left: 4px solid #1E3A5F; padding: 20px; margin: 30px 0; border-radius: 0 8px 8px 0;">
        <h2 style="color: #1E3A5F; margin: 0 0 15px 0; font-size: 18px;">Order Details</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;"><strong>Order ID:</strong></td>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;">${sampleData.orderId}</td>
          </tr>
          <tr>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;"><strong>For:</strong></td>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;">${sampleData.recipientName}</td>
          </tr>
          <tr>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;"><strong>Occasion:</strong></td>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;">${sampleData.occasion}</td>
          </tr>
          <tr>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;"><strong>Genre:</strong></td>
            <td style="color: #5D4E37; padding: 8px 0; font-size: 14px;">${sampleData.genre}</td>
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
        We'll email you as soon as your song is ready. If you have any questions, just reply to this email.
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6; margin-bottom: 0;">
        With love,<br>
        <strong style="color: #1E3A5F;">The Personal Song Gifts Team</strong> 🎶
      </p>
    </div>
    
    <div style="text-align: center; padding: 20px;">
      <p style="color: #6B7B8C; font-size: 12px; margin: 0;">
        © 2026 Personal Song Gifts. Made with ❤️
      </p>
      <p style="color: #999; font-size: 11px; margin-top: 10px;">
        ⚠️ This is a TEST EMAIL sent from the Admin Dashboard
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

function getSongDeliveryHtml() {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #FDF8F3; font-family: 'Georgia', serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #2E7D32 0%, #4CAF50 100%); padding: 40px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="color: #FFFFFF; margin: 0; font-size: 32px; font-weight: normal;">🎉 Your Song is Ready!</h1>
    </div>
    
    <div style="background-color: #FFFBF5; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <p style="color: #5D4E37; font-size: 18px; line-height: 1.6; margin-top: 0;">
        Dear ${sampleData.customerName},
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        Great news! Your personalized ${sampleData.occasion} song for <strong>${sampleData.recipientName}</strong> is complete and ready to share!
      </p>
      
      <div style="text-align: center; margin: 40px 0;">
        <a href="${sampleData.songUrl}" style="display: inline-block; background: linear-gradient(135deg, #1E3A5F 0%, #2C4A6E 100%); color: #FDF8F3; text-decoration: none; padding: 18px 40px; font-size: 18px; border-radius: 30px; font-weight: bold; box-shadow: 0 4px 15px rgba(30, 58, 95, 0.3);">
          🎵 Listen to Your Song
        </a>
      </div>
      
      <div style="background-color: #F5F8FB; border-radius: 8px; padding: 20px; margin: 30px 0;">
        <h3 style="color: #1E3A5F; margin: 0 0 10px 0; font-size: 16px;">💡 Tips for Sharing</h3>
        <ul style="color: #5D4E37; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
          <li>Play it at your next celebration or gathering</li>
          <li>Send the link directly via text or messaging apps</li>
          <li>Download and save it forever</li>
          <li>Share on social media to spread the joy</li>
        </ul>
      </div>
      
      <div style="background-color: #EEF3F8; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
        <p style="color: #1E3A5F; margin: 0; font-size: 14px;">
          <strong>Order ID:</strong> ${sampleData.orderId}
        </p>
      </div>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        We hope this song brings joy and unforgettable memories! If you love it, we'd be honored if you shared your experience with friends and family.
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6; margin-bottom: 0;">
        With love and music,<br>
        <strong style="color: #1E3A5F;">The Personal Song Gifts Team</strong> 🎶
      </p>
    </div>
    
    <div style="text-align: center; padding: 20px;">
      <p style="color: #6B7B8C; font-size: 12px; margin: 0;">
        © 2026 Personal Song Gifts. Made with ❤️<br>
        <a href="https://personalsonggifts.lovable.app" style="color: #1E3A5F;">Order another song</a>
      </p>
      <p style="color: #999; font-size: 11px; margin-top: 10px;">
        ⚠️ This is a TEST EMAIL sent from the Admin Dashboard
      </p>
    </div>
  </div>
</body>
</html>
  `;
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

    const { email, template, adminPassword: providedPassword }: SendTestEmailRequest = await req.json();

    if (!providedPassword || providedPassword.trim() !== adminPassword.trim()) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!email || !template) {
      return new Response(
        JSON.stringify({ error: "Email and template are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = "support@personalsonggifts.com";
    const senderName = "Personal Song Gifts";

    if (!brevoApiKey) {
      throw new Error("BREVO_API_KEY not configured");
    }

    const previewUrl = `https://personalsonggifts.lovable.app/preview/${sampleData.previewToken}`;
    
    let emailHtml: string;
    let subject: string;

    switch (template) {
      case "lead_preview":
        emailHtml = getLeadPreviewHtml(previewUrl);
        subject = `🎵 [TEST] Your song for ${sampleData.recipientName} is ready - listen now!`;
        break;
      case "lead_followup":
        emailHtml = getLeadFollowupHtml(previewUrl);
        subject = `🎁 [TEST] Special Offer: $5 Off Your ${sampleData.occasion} Song!`;
        break;
      case "order_confirmation":
        emailHtml = getOrderConfirmationHtml();
        subject = `🎵 [TEST] Order Confirmed - Your song for ${sampleData.recipientName}!`;
        break;
      case "song_delivery":
        emailHtml = getSongDeliveryHtml();
        subject = `🎉 [TEST] Your Song is Ready - Listen Now!`;
        break;
      default:
        return new Response(
          JSON.stringify({ error: "Invalid template type" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
        to: [{ email, name: "Test User" }],
        subject,
        htmlContent: emailHtml,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Brevo API error:", errorData);
      throw new Error(`Failed to send email: ${response.status}`);
    }

    const result = await response.json();
    console.log(`Test email (${template}) sent to ${email}:`, result);

    return new Response(
      JSON.stringify({ success: true, messageId: result.messageId, template }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send test email error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
