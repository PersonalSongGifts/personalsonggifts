import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendTestEmailRequest {
  email: string;
  template: "lead_preview" | "lead_followup" | "order_confirmation" | "song_delivery";
  adminPassword: string;
  previewToken?: string; // optional: use a specific lead's token
}

// Fallback sample data when no real lead is found
const fallbackData = {
  customerName: "Test Customer",
  recipientName: "Test Recipient",
  occasion: "Birthday",
  genre: "Acoustic Pop",
  orderId: "TEST12345",
  songUrl: "https://personalsonggifts.lovable.app/song/demo",
};

function getLeadPreviewHtml(data: { customerName: string; recipientName: string; occasion: string }, previewUrl: string, email: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: Arial, Helvetica, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Hi ${data.customerName},</p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      We created a personalized ${data.occasion} song for ${data.recipientName} and wanted you to hear it first.
    </p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      This is a short preview. Once you complete your purchase, you'll receive the full song.
    </p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;"><strong>Listen to the preview:</strong></p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
      <a href="${previewUrl}" style="color: #1E3A5F;">${previewUrl}</a>
    </p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 40px 0;">— The Personal Song Gifts Team</p>
    <hr style="border: none; border-top: 1px solid #eeeeee; margin: 0 0 20px 0;">
    <p style="color: #999999; font-size: 12px; margin: 0 0 6px 0;">Personal Song Gifts &bull; 2108 N ST STE N, SACRAMENTO, CA 95816</p>
    <p style="color: #999999; font-size: 12px; margin: 0 0 6px 0;">
      <a href="https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(email)}" style="color: #999999;">Unsubscribe</a>
    </p>
    <p style="color: #cccccc; font-size: 11px; margin: 0;">This is a TEST EMAIL sent from the Admin Dashboard</p>
  </div>
</body>
</html>
  `;
}

function getLeadPreviewText(data: { customerName: string; recipientName: string; occasion: string }, previewUrl: string, email: string) {
  return `Hi ${data.customerName},

We created a personalized ${data.occasion} song for ${data.recipientName} and wanted you to hear it first.

This is a short preview. Once you complete your purchase, you'll receive the full song.

Listen to the preview here: ${previewUrl}

— The Personal Song Gifts Team

---
Personal Song Gifts
2108 N ST STE N, SACRAMENTO, CA 95816

Unsubscribe: https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(email)}

This is a TEST EMAIL sent from the Admin Dashboard
`;
}

function getLeadFollowupHtml(data: { customerName: string; recipientName: string }, previewUrl: string, email: string) {
  const followupUrl = `${previewUrl}?followup=true`;
  const firstName = data.customerName.split(" ")[0];
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: Arial, Helvetica, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Hi ${firstName},</p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      You listened to ${data.recipientName}'s song the other day — we hope it put a smile on your face.
    </p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      We wanted to reach out because we'd love for ${data.recipientName} to actually hear it. So we're taking $10 off — no code needed, it's already applied to the link below.
    </p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
      <a href="${followupUrl}" style="color: #1E3A5F;">${followupUrl}</a>
    </p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      The full song is between 3–6 minutes long and includes everything you shared with us about ${data.recipientName}.
    </p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      If you have any questions just reply to this email — a real person will get back to you.
    </p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 40px 0;">— The Personal Song Gifts team</p>
    <hr style="border: none; border-top: 1px solid #eeeeee; margin: 0 0 20px 0;">
    <p style="color: #999999; font-size: 12px; margin: 0 0 6px 0;">Personal Song Gifts &bull; 2108 N ST STE N, SACRAMENTO, CA 95816</p>
    <p style="color: #999999; font-size: 12px; margin: 0 0 6px 0;">
      <a href="https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(email)}" style="color: #999999;">Unsubscribe</a>
    </p>
    <p style="color: #cccccc; font-size: 11px; margin: 0;">This is a TEST EMAIL sent from the Admin Dashboard</p>
  </div>
</body>
</html>
  `;
}

function getLeadFollowupText(data: { customerName: string; recipientName: string }, previewUrl: string, email: string) {
  const followupUrl = `${previewUrl}?followup=true`;
  const firstName = data.customerName.split(" ")[0];
  return `Hi ${firstName},

You listened to ${data.recipientName}'s song the other day — we hope it put a smile on your face.

We wanted to reach out because we'd love for ${data.recipientName} to actually hear it. So we're taking $10 off — no code needed, it's already applied to the link below.

${followupUrl}

The full song is between 3–6 minutes long and includes everything you shared with us about ${data.recipientName}.

If you have any questions just reply to this email — a real person will get back to you.

— The Personal Song Gifts team

---
Personal Song Gifts
2108 N ST STE N, SACRAMENTO, CA 95816

Unsubscribe: https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(email)}

This is a TEST EMAIL sent from the Admin Dashboard
`;
}

function getOrderConfirmationHtml(data: { customerName: string; recipientName: string; occasion: string; genre: string; orderId: string }, email: string) {
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
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: Arial, Helvetica, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <p style="color: #1E3A5F; font-size: 22px; font-weight: bold; margin: 0 0 30px 0;">Order Confirmed</p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Dear ${data.customerName},</p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Thank you for your order! We're creating a personalized ${data.occasion} song for <strong>${data.recipientName}</strong> and our team is already getting started.
    </p>
    <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
      <tr style="border-bottom: 1px solid #eeeeee;">
        <td style="color: #555555; padding: 10px 0; font-size: 14px; width: 40%;"><strong>Order ID</strong></td>
        <td style="color: #333333; padding: 10px 0; font-size: 14px;">${data.orderId}</td>
      </tr>
      <tr style="border-bottom: 1px solid #eeeeee;">
        <td style="color: #555555; padding: 10px 0; font-size: 14px;"><strong>Song for</strong></td>
        <td style="color: #333333; padding: 10px 0; font-size: 14px;">${data.recipientName}</td>
      </tr>
      <tr style="border-bottom: 1px solid #eeeeee;">
        <td style="color: #555555; padding: 10px 0; font-size: 14px;"><strong>Occasion</strong></td>
        <td style="color: #333333; padding: 10px 0; font-size: 14px;">${data.occasion}</td>
      </tr>
      <tr style="border-bottom: 1px solid #eeeeee;">
        <td style="color: #555555; padding: 10px 0; font-size: 14px;"><strong>Genre</strong></td>
        <td style="color: #333333; padding: 10px 0; font-size: 14px;">${data.genre}</td>
      </tr>
      <tr>
        <td style="color: #555555; padding: 10px 0; font-size: 14px;"><strong>Delivery</strong></td>
        <td style="color: #333333; padding: 10px 0; font-size: 14px;">${tierLabel} — by ${deliveryDate}</td>
      </tr>
    </table>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      We'll email you as soon as your song is ready. If you have any questions, just reply to this email.
    </p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 40px 0;">
      Warm regards,<br>The Personal Song Gifts Team
    </p>
    <hr style="border: none; border-top: 1px solid #eeeeee; margin: 0 0 20px 0;">
    <p style="color: #999999; font-size: 12px; margin: 0 0 6px 0;">Personal Song Gifts &bull; 2108 N ST STE N, SACRAMENTO, CA 95816</p>
    <p style="color: #999999; font-size: 12px; margin: 0 0 6px 0;">
      <a href="https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(email)}" style="color: #999999;">Unsubscribe</a>
    </p>
    <p style="color: #cccccc; font-size: 11px; margin: 0;">This is a TEST EMAIL sent from the Admin Dashboard</p>
  </div>
</body>
</html>
  `;
}

function getOrderConfirmationText(data: { customerName: string; recipientName: string; occasion: string; genre: string; orderId: string }, email: string) {
  const tierLabel = "Priority (24-hour)";
  const deliveryDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return `Order Confirmed

Dear ${data.customerName},

Thank you for your order! We're creating a personalized ${data.occasion} song for ${data.recipientName} and our team is already getting started.

Order ID: ${data.orderId}
Song for: ${data.recipientName}
Occasion: ${data.occasion}
Genre: ${data.genre}
Delivery: ${tierLabel} — by ${deliveryDate}

We'll email you as soon as your song is ready. If you have any questions, just reply to this email.

Warm regards,
The Personal Song Gifts Team

---
Personal Song Gifts
2108 N ST STE N, SACRAMENTO, CA 95816

Unsubscribe: https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(email)}

This is a TEST EMAIL sent from the Admin Dashboard
`;
}

function getSongDeliveryHtml(data: { customerName: string; recipientName: string; occasion: string; orderId: string; songUrl: string }, email: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: Arial, Helvetica, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <p style="color: #1E3A5F; font-size: 22px; font-weight: bold; margin: 0 0 30px 0;">Your song is ready!</p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Dear ${data.customerName},</p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Your personalized ${data.occasion} song for <strong>${data.recipientName}</strong> is complete and ready to share!
    </p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;"><strong>Listen here:</strong></p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
      <a href="${data.songUrl}" style="color: #1E3A5F;">${data.songUrl}</a>
    </p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      From the song page you can listen, download, and share with friends and family. We hope it brings joy!
    </p>
    <p style="color: #555555; font-size: 14px; margin: 0 0 4px 0;"><strong>Order ID:</strong> ${data.orderId}</p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 30px 0 40px 0;">
      Warm regards,<br>The Personal Song Gifts Team
    </p>
    <hr style="border: none; border-top: 1px solid #eeeeee; margin: 0 0 20px 0;">
    <p style="color: #999999; font-size: 12px; margin: 0 0 6px 0;">Personal Song Gifts &bull; 2108 N ST STE N, SACRAMENTO, CA 95816</p>
    <p style="color: #999999; font-size: 12px; margin: 0 0 6px 0;">
      <a href="https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(email)}" style="color: #999999;">Unsubscribe</a>
    </p>
    <p style="color: #cccccc; font-size: 11px; margin: 0;">This is a TEST EMAIL sent from the Admin Dashboard</p>
  </div>
</body>
</html>
  `;
}

function getSongDeliveryText(data: { customerName: string; recipientName: string; occasion: string; orderId: string; songUrl: string }, email: string) {
  return `Your song is ready!

Dear ${data.customerName},

Your personalized ${data.occasion} song for ${data.recipientName} is complete and ready to share!

Listen here: ${data.songUrl}

Order ID: ${data.orderId}

We hope it brings joy!

Warm regards,
The Personal Song Gifts Team

---
Personal Song Gifts
2108 N ST STE N, SACRAMENTO, CA 95816

Unsubscribe: https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(email)}

This is a TEST EMAIL sent from the Admin Dashboard
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

    const { email, template, adminPassword: providedPassword, previewToken }: SendTestEmailRequest = await req.json();

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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to fetch a real lead if previewToken is provided, or find any valid lead
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let leadData: { customerName: string; recipientName: string; occasion: string; genre: string; previewToken: string } | null = null;

    if (previewToken) {
      // Use the specific token provided
      const { data: lead } = await supabase
        .from("leads")
        .select("customer_name, recipient_name, occasion, genre, preview_token")
        .eq("preview_token", previewToken)
        .maybeSingle();

      if (lead && lead.preview_token) {
        leadData = {
          customerName: lead.customer_name,
          recipientName: lead.recipient_name,
          occasion: lead.occasion,
          genre: lead.genre,
          previewToken: lead.preview_token,
        };
      }
    }

    if (!leadData) {
      // Try to find any lead with a valid preview token and song
      const { data: anyLead } = await supabase
        .from("leads")
        .select("customer_name, recipient_name, occasion, genre, preview_token")
        .not("preview_token", "is", null)
        .not("preview_song_url", "is", null)
        .eq("status", "preview_sent")
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (anyLead && anyLead.preview_token) {
        leadData = {
          customerName: anyLead.customer_name,
          recipientName: anyLead.recipient_name,
          occasion: anyLead.occasion,
          genre: anyLead.genre,
          previewToken: anyLead.preview_token,
        };
      }
    }

    // Build data object for templates
    const data = leadData
      ? {
          customerName: leadData.customerName,
          recipientName: leadData.recipientName,
          occasion: leadData.occasion,
          genre: leadData.genre,
          orderId: "TEST12345",
          songUrl: "https://personalsonggifts.lovable.app/song/demo",
        }
      : fallbackData;

    const previewTokenToUse = leadData?.previewToken || "demo";
    const previewUrl = `https://personalsonggifts.lovable.app/preview/${previewTokenToUse}`;

    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = "support@personalsonggifts.com";
    const senderName = "Personal Song Gifts";

    if (!brevoApiKey) {
      throw new Error("BREVO_API_KEY not configured");
    }

    let emailHtml: string;
    let textContent: string;
    let subject: string;

    switch (template) {
      case "lead_preview":
        emailHtml = getLeadPreviewHtml(data, previewUrl, email);
        textContent = getLeadPreviewText(data, previewUrl, email);
        subject = `[TEST] Your song for ${data.recipientName} is ready to preview`;
        break;
      case "lead_followup":
        emailHtml = getLeadFollowupHtml(data, previewUrl, email);
        textContent = getLeadFollowupText(data, previewUrl, email);
        subject = `[TEST] ${data.recipientName}'s song is still waiting`;
        break;
      case "order_confirmation":
        emailHtml = getOrderConfirmationHtml(data, email);
        textContent = getOrderConfirmationText(data, email);
        subject = `[TEST] Order confirmed - ${data.recipientName}'s song is being created`;
        break;
      case "song_delivery":
        emailHtml = getSongDeliveryHtml(data, email);
        textContent = getSongDeliveryText(data, email);
        subject = `[TEST] ${data.recipientName}'s song is complete and ready to share`;
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
        textContent: textContent,
        headers: {
          "Precedence": "transactional",
          "List-Unsubscribe": `<mailto:unsubscribe@personalsonggifts.com?subject=Unsubscribe>, <https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(email)}>`,
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
    console.log(`Test email (${template}) sent to ${email} using token ${previewTokenToUse}:`, result);

    return new Response(
      JSON.stringify({ success: true, messageId: result.messageId, template, previewToken: previewTokenToUse }),
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
