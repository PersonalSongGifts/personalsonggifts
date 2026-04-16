import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { leadMatchesOrder } from "../_shared/lead-order-matching.ts";
import { logActivity } from "../_shared/activity-log.ts";
import { getActivePromoForBanner, renderPromoBannerHtml, renderPromoBannerText, PromoBannerData } from "../_shared/email-promo-banner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

interface SendFollowupRequest {
  leadId: string;
  adminPassword: string;
  resend?: boolean;
  source?: "manual" | "cron" | "batch";
}

interface ActivePromo {
  name: string;
  lead_price_cents: number;
  standard_price_cents: number;
}

function buildFollowupEmail(
  lead: { customer_name: string; recipient_name: string; preview_token: string; revision_token?: string | null },
  email: string,
  promo: ActivePromo | null,
  bannerData: PromoBannerData | null,
) {
  const firstName = lead.customer_name.split(" ")[0];
  const previewUrl = `https://personalsonggifts.lovable.app/preview/${lead.preview_token}?followup=true`;
  const revisionUrl = lead.revision_token
    ? `https://personalsonggifts.lovable.app/song/revision/${lead.revision_token}`
    : null;

  const subject = `${lead.recipient_name}'s song is still waiting`;

  const promoPrice = promo
    ? `$${(promo.lead_price_cents / 100).toFixed(2)}`
    : "$39.99";
  const originalPrice = "$99.99";

  const offerParagraph = promo
    ? `We're running a sale right now — get the full song for just ${promoPrice} (normally ${originalPrice}). No code needed, the discount is already applied to the link below.`
    : `So we're taking $10 off — no code needed, it's already applied to the link below.`;

  const bannerHtml = renderPromoBannerHtml(bannerData);
  const bannerText = renderPromoBannerText(bannerData);

  const revisionHtmlBlock = revisionUrl
    ? `<p style="color: #555555; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">Want changes to the preview? <a href="${revisionUrl}" style="color: #1E3A5F;">Request a revision</a> — we'll regenerate it within ~12 hours.</p>`
    : "";
  const revisionTextBlock = revisionUrl
    ? `\nWant changes to the preview? Request a revision here: ${revisionUrl}\n`
    : "";

  const textContent = `${bannerText}Hi ${firstName},

You listened to ${lead.recipient_name}'s song the other day — we hope it put a smile on your face.

We wanted to reach out because we'd love for ${lead.recipient_name} to actually hear it. ${offerParagraph}

${previewUrl}

The full song is between 3–6 minutes long and includes everything you shared with us about ${lead.recipient_name}.
${revisionTextBlock}
If you have any questions just reply to this email — a real person will get back to you.

— The Personal Song Gifts team

---
Personal Song Gifts
2108 N ST STE N, SACRAMENTO, CA 95816

To unsubscribe: https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(email)}`;

  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: Arial, Helvetica, sans-serif;">
  ${bannerHtml}
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">Hi ${firstName},</p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      You listened to ${lead.recipient_name}'s song the other day — we hope it put a smile on your face.
    </p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      We wanted to reach out because we'd love for ${lead.recipient_name} to actually hear it. ${offerParagraph}
    </p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
      <a href="${previewUrl}" style="color: #1E3A5F;">${previewUrl}</a>
    </p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      The full song is between 3–6 minutes long and includes everything you shared with us about ${lead.recipient_name}.
    </p>

    ${revisionHtmlBlock}

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      If you have any questions just reply to this email — a real person will get back to you.
    </p>

    <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 40px 0;">
      — The Personal Song Gifts team
    </p>

    <hr style="border: none; border-top: 1px solid #eeeeee; margin: 0 0 20px 0;">
    <p style="color: #999999; font-size: 12px; margin: 0 0 6px 0;">
      Personal Song Gifts &bull; 2108 N ST STE N, SACRAMENTO, CA 95816
    </p>
    <p style="color: #999999; font-size: 12px; margin: 0;">
      <a href="https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(email)}" style="color: #999999;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;

  return { subject, htmlContent, textContent, previewUrl };
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

    const { leadId, adminPassword: providedPassword, resend, source }: SendFollowupRequest = await req.json();

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

    // Purchase guard: fingerprint match
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

    // Check suppression
    const { data: suppressed } = await supabase
      .from("email_suppressions")
      .select("email")
      .eq("email", lead.email.toLowerCase())
      .maybeSingle();

    if (suppressed) {
      console.log(`Lead ${lead.id} email ${lead.email} is suppressed, skipping follow-up`);
      return new Response(
        JSON.stringify({ error: "Email is suppressed" }),
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

    if (!lead.preview_token) {
      return new Response(
        JSON.stringify({ error: "Lead has no preview token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // RACE CONDITION FIX: Set follow_up_sent_at BEFORE sending to prevent double-send
    const { data: claimed, error: claimError } = await supabase
      .from("leads")
      .update({ follow_up_sent_at: new Date().toISOString() })
      .eq("id", leadId)
      .is("follow_up_sent_at", null)
      .select("id")
      .maybeSingle();

    // If resend=true, we skip the atomic claim and just proceed
    if (!resend && (!claimed || claimError)) {
      console.log(`Lead ${leadId} follow-up already claimed by another process`);
      return new Response(
        JSON.stringify({ error: "Follow-up already being sent" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (resend) {
      // For resends, just update the timestamp
      await supabase.from("leads").update({ follow_up_sent_at: new Date().toISOString() }).eq("id", leadId);
    }

    // Query active promo (same logic as get-active-promo)
    const now = new Date().toISOString();
    const { data: activePromo } = await supabase
      .from("promotions")
      .select("name, lead_price_cents, standard_price_cents")
      .eq("is_active", true)
      .lte("starts_at", now)
      .gte("ends_at", now)
      .limit(1)
      .maybeSingle();

    // Build and send email
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = "support@personalsonggifts.com";
    const senderName = "Personal Song Gifts";

    if (!brevoApiKey) {
      throw new Error("BREVO_API_KEY not configured");
    }

    const bannerData = await getActivePromoForBanner(supabase);

    const { subject, htmlContent, textContent } = buildFollowupEmail(lead, lead.email, activePromo, bannerData);
    const messageId = `<${lead.id}.followup.${Date.now()}@personalsonggifts.com>`;

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
        subject,
        htmlContent,
        textContent,
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
      // On failure, clear follow_up_sent_at so it can be retried
      if (!resend) {
        await supabase.from("leads").update({ follow_up_sent_at: null }).eq("id", leadId);
      }
      throw new Error(`Failed to send email: ${response.status}`);
    }

    const result = await response.json();
    const offerDesc = activePromo
      ? `${activePromo.name} promo at $${(activePromo.lead_price_cents / 100).toFixed(2)}`
      : "$10 off ($39.99)";
    console.log(`Follow-up email (${source || "manual"}) sent to ${lead.email} with offer: ${offerDesc}`, result);

    // Log activity
    await logActivity(supabase, "lead", lead.id, "followup_sent", source === "cron" || source === "batch" ? "system" : "admin",
      `Follow-up sent to ${lead.email} — offer: ${offerDesc} (source: ${source || "manual"})`);

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
