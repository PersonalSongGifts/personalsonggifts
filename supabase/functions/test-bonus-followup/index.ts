// Throwaway harness: exercises ONLY the late-arrival bonus follow-up send logic
// against a specific order id. Not wired to any callback. Delete after proof.
import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { logActivity } from "../_shared/activity-log.ts";

Deno.serve(async (req) => {
  const { orderId } = await req.json();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Atomic claim mirroring automation-suno-callback bonus success path.
  const { data: claimed } = await supabase
    .from("orders")
    .update({ bonus_notified_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("bonus_notified_at", null)
    .not("sent_at", "is", null)
    .select("id, customer_email, customer_email_override, customer_name, recipient_name, bonus_song_title")
    .maybeSingle();

  if (!claimed) {
    return new Response(JSON.stringify({ claimed: false }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const brevoApiKey = Deno.env.get("BREVO_API_KEY")!;
  const toEmail = claimed.customer_email_override || claimed.customer_email;
  const entityId = claimed.id;
  const shortId = entityId.slice(0, 8);
  const songPageUrl = `https://personalsonggifts.lovable.app/song/${shortId}`;
  const bonusTitle = (claimed.bonus_song_title as string) || "";
  const styleLabel = bonusTitle.includes("R&B") ? "R&B" : "acoustic";
  const bonusArticle = styleLabel === "R&B" ? "an R&B" : "an acoustic";
  const recipient = claimed.recipient_name || "your loved one";
  const customerName = claimed.customer_name || "there";
  const subject = `A bonus version of ${recipient}'s song just dropped 🎁`;
  const messageId = `<${entityId}.bonus.${Date.now()}@personalsonggifts.com>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#fff;font-family:Arial,Helvetica,sans-serif;"><div style="max-width:600px;margin:0 auto;padding:40px 20px;"><p style="color:#1E3A5F;font-size:22px;font-weight:bold;margin:0 0 30px 0;">Your bonus track just arrived 🎁</p><p style="color:#333;font-size:16px;line-height:1.6;">Hi ${customerName},</p><p style="color:#333;font-size:16px;line-height:1.6;">Good news — ${bonusArticle} version of ${recipient}'s song is now ready and waiting on the same song page as the original.</p><p style="color:#333;font-size:16px;"><strong>Listen here:</strong> <a href="${songPageUrl}" style="color:#1E3A5F;">${songPageUrl}</a></p><p style="margin:20px 0;"><a href="${songPageUrl}" style="background:#1E3A5F;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-size:16px;">Play the bonus version</a></p><p style="color:#555;font-size:14px;"><strong>Order ID:</strong> ${shortId.toUpperCase()}</p><p style="color:#333;font-size:16px;margin-top:30px;">Warm regards,<br>The Personal Song Gifts Team</p><hr style="border:none;border-top:1px solid #eee;margin:20px 0;"><p style="color:#999;font-size:12px;">Personal Song Gifts, 2108 N ST STE N, SACRAMENTO, CA 95816</p><p style="color:#999;font-size:12px;"><a href="https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(toEmail)}" style="color:#999;">Unsubscribe</a></p></div></body></html>`;
  const text = `Your bonus track just arrived\n\nHi ${customerName},\n\nGood news — ${bonusArticle} version of ${recipient}'s song is now ready and waiting on the same song page as the original.\n\nListen here: ${songPageUrl}\n\nOrder ID: ${shortId.toUpperCase()}\n\nWarm regards,\nThe Personal Song Gifts Team`;

  const brevoResp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "api-key": brevoApiKey,
    },
    body: JSON.stringify({
      sender: { name: "Personal Song Gifts", email: "support@personalsonggifts.com" },
      replyTo: { email: "support@personalsonggifts.com", name: "Personal Song Gifts" },
      to: [{ email: toEmail, name: customerName }],
      subject, htmlContent: html, textContent: text,
      headers: {
        "Message-ID": messageId,
        "X-Entity-Ref-ID": entityId,
        "Precedence": "transactional",
      },
    }),
  });

  const body = await brevoResp.text();
  if (brevoResp.ok) {
    await logActivity(supabase, "order", entityId, "bonus_followup_sent", "system", `[TEST HARNESS] Late-arrival bonus follow-up sent to ${toEmail}`);
  }
  return new Response(JSON.stringify({ claimed: true, status: brevoResp.status, body: body.substring(0, 500) }), { status: 200, headers: { "Content-Type": "application/json" } });
});