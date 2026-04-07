import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { sendSms } from "../_shared/brevo-sms.ts";
import { logActivity } from "../_shared/activity-log.ts";

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
  ccEmail?: string | null;
  revisionToken?: string | null;
  // SMS fields
  phoneE164?: string | null;
  smsOptIn?: boolean;
  timezone?: string | null;
  smsStatus?: string | null;
  bonusAvailable?: boolean;
  bonusSongTitle?: string | null;
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
      ccEmail,
      revisionToken,
      phoneE164,
      smsOptIn,
      timezone,
      smsStatus,
      bonusAvailable,
      bonusSongTitle,
    }: SongDeliveryRequest = await req.json();

    // Derive bonus genre label from title
    const bonusGenreLabel = bonusSongTitle
      ? (bonusSongTitle.includes("(R&B") ? "R&B" : "acoustic")
      : "acoustic";

    if (!customerEmail || !orderId || !songUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const messageId = `<${orderId}.delivery.${Date.now()}@personalsonggifts.com>`;

    const songPageUrl = `https://personalsonggifts.lovable.app/song/${orderId.slice(0, 8)}`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: Arial, Helvetica, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <p style="color: #1E3A5F; font-size: 22px; font-weight: bold; margin: 0 0 30px 0;">Your song is ready!</p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Dear ${customerName || "Valued Customer"},
    </p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Your personalized ${occasion} song for <strong>${recipientName}</strong> is complete and ready to share!
    </p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 8px 0;">
      <strong>Listen here:</strong>
    </p>
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
      <a href="${songPageUrl}" style="color: #1E3A5F;">${songPageUrl}</a>
    </p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      From the song page you can listen, download, and share with friends and family. We hope it brings joy!
    </p>

    <p style="color: #555555; font-size: 14px; margin: 0 0 4px 0;"><strong>Order ID:</strong> ${orderId.slice(0, 8).toUpperCase()}</p>

    ${revisionToken ? `<p style="color: #555555; font-size: 14px; line-height: 1.6; margin: 16px 0;">
      <strong>Want changes?</strong> You can request a revision here:
      <a href="https://personalsonggifts.lovable.app/song/revision/${revisionToken}" style="color: #1E3A5F;">Request a revision</a>
    </p>` : ''}

    ${bonusAvailable ? `<p style="color: #555555; font-size: 14px; line-height: 1.6; margin: 16px 0;">
      P.S. We also made ${bonusGenreLabel === "R&B" ? "an R&B" : "an acoustic"} version of your song — visit your song page to check it out.
    </p>` : ''}

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 30px 0 40px 0;">
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

    const textContent = `Your song is ready!

Dear ${customerName || "Valued Customer"},

Your personalized ${occasion} song for ${recipientName} is complete and ready to share!

Listen here: ${songPageUrl}

Order ID: ${orderId.slice(0, 8).toUpperCase()}
${revisionToken ? `\nWant changes? Request a revision: https://personalsonggifts.lovable.app/song/revision/${revisionToken}\n` : ''}
${bonusAvailable ? `P.S. We also made ${bonusGenreLabel === "R&B" ? "an R&B" : "an acoustic"} version of your song — visit your song page to check it out.\n` : ''}
We hope it brings joy!

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
        ...(ccEmail ? { cc: [{ email: ccEmail }] } : {}),
        subject: `${recipientName}'s song is complete and ready to share`,
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
    console.log("Song delivery email sent:", result);

    // Log activity
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sbClient = createClient(supabaseUrl, supabaseServiceKey);
    await logActivity(sbClient, "order", orderId, "delivery_sent", "system", `Delivery email sent to ${customerEmail}`);

    // === SMS DELIVERY (after email success) ===
    let smsResult = null;
    if (smsOptIn === true && phoneE164 && smsStatus !== "sent") {
      const shortId = orderId.slice(0, 8);
      const songLink = `https://personalsonggifts.lovable.app/song/${shortId}`;
      
      // ASSERTION: Order SMS must contain /song/ path, never /preview/
      const smsText = `Your custom song is ready!\nListen here: ${songLink}\nReply STOP to opt out.`;
      if (smsText.includes("/preview/")) {
        console.error("[SMS] ASSERTION FAILED: Order SMS contains /preview/ link!");
      } else {
        smsResult = await sendSms({
          to: phoneE164,
          text: smsText,
          tag: "order_delivery",
          timezone: timezone || undefined,
        });
        console.log("[SMS] Order delivery SMS result:", JSON.stringify(smsResult));
      }
    }

    return new Response(
      JSON.stringify({ success: true, messageId: result.messageId, sms: smsResult }),
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
