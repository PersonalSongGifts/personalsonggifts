// Admin action: comp the full bonus track to a customer (no payment).
// Sets bonus_unlocked_at, marks unlock session as admin comp, logs activity,
// and optionally emails the customer with their song page link.
import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { logActivity } from "../_shared/activity-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-password",
};

const SITE_URL = "https://www.personalsonggifts.com";
const FROM_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") || "support@personalsonggifts.com";
const FROM_NAME = Deno.env.get("BREVO_SENDER_NAME") || "Personal Song Gifts";

async function sendViaBrevo(
  toEmail: string,
  toName: string,
  subject: string,
  html: string,
  text: string,
) {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) throw new Error("BREVO_API_KEY not set");

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email: toEmail, name: toName || toEmail }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Brevo ${res.status}: ${errBody}`);
  }
  return await res.json();
}

function buildEmail(opts: {
  customerName: string;
  recipientName: string;
  songLink: string;
}): { subject: string; html: string; text: string } {
  const firstName = (opts.customerName || "").split(" ")[0] || "there";
  const subject = `A second version of ${opts.recipientName}'s song — on us`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#222;font-size:15px;line-height:1.6;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
<p>Hi ${firstName},</p>

<p>Good news — we've unlocked the full bonus version of ${opts.recipientName}'s song for you, on the house. It's the alternate style we produced alongside your main song.</p>

<p>You can listen and download it on your song page (scroll down to the bonus section):</p>

<p><a href="${opts.songLink}" style="color:#1a73e8;">${opts.songLink}</a></p>

<p>Enjoy both versions — and let us know which one ${opts.recipientName} loves more.</p>

<p>— Personal Song Gifts team</p>
</div></body></html>`;

  const text = `Hi ${firstName},

Good news — we've unlocked the full bonus version of ${opts.recipientName}'s song for you, on the house. It's the alternate style we produced alongside your main song.

You can listen and download it on your song page (scroll down to the bonus section):

${opts.songLink}

Enjoy both versions — and let us know which one ${opts.recipientName} loves more.

— Personal Song Gifts team`;

  return { subject, html, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    if (!adminPassword) throw new Error("ADMIN_PASSWORD not configured");
    const expected = adminPassword.trim();

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const provided =
      (req.headers.get("x-admin-password") ??
        (typeof body.adminPassword === "string" ? body.adminPassword : null))
        ?.trim() ?? null;

    if (!provided || provided !== expected) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orderId = typeof body.orderId === "string" ? body.orderId : null;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const sendEmail = body.sendEmail !== false; // default true

    if (!orderId) {
      return new Response(JSON.stringify({ error: "orderId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load order
    const { data: order, error: loadErr } = await supabase
      .from("orders")
      .select(
        "id, customer_name, customer_email, customer_email_override, recipient_name, bonus_song_url, bonus_unlocked_at",
      )
      .eq("id", orderId)
      .maybeSingle();

    if (loadErr) throw loadErr;
    if (!order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!order.bonus_song_url) {
      return new Response(
        JSON.stringify({ error: "No bonus track exists for this order yet" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (order.bonus_unlocked_at) {
      return new Response(
        JSON.stringify({
          error: "Bonus track is already unlocked",
          bonus_unlocked_at: order.bonus_unlocked_at,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const now = new Date().toISOString();
    const compSessionId = `admin_comp_${Date.now()}`;

    const { error: updateErr } = await supabase
      .from("orders")
      .update({
        bonus_unlocked_at: now,
        bonus_unlock_session_id: compSessionId,
        bonus_price_cents: 0,
      })
      .eq("id", orderId);

    if (updateErr) throw updateErr;

    await logActivity(
      supabase,
      "order",
      orderId,
      "bonus_comped",
      "admin",
      reason || "Admin unlocked bonus track for customer",
      { sendEmail },
    );

    let emailResult: { sent: boolean; error?: string; recipient?: string } = {
      sent: false,
    };

    if (sendEmail) {
      const recipient = order.customer_email_override || order.customer_email;
      if (!recipient) {
        emailResult = { sent: false, error: "no recipient email on order" };
      } else {
        // Skip if suppressed
        const { data: suppressed } = await supabase
          .from("email_suppressions")
          .select("email")
          .eq("email", recipient.toLowerCase())
          .maybeSingle();

        if (suppressed) {
          emailResult = {
            sent: false,
            error: "recipient is on email suppression list",
            recipient,
          };
        } else {
          const songLink = `${SITE_URL}/song/${order.id.substring(0, 8)}`;
          const { subject, html, text } = buildEmail({
            customerName: order.customer_name || "",
            recipientName: order.recipient_name || "your gift",
            songLink,
          });
          try {
            await sendViaBrevo(
              recipient,
              order.customer_name || recipient,
              subject,
              html,
              text,
            );
            emailResult = { sent: true, recipient };
            await logActivity(
              supabase,
              "order",
              orderId,
              "bonus_comp_email_sent",
              "admin",
              `Comp unlock email sent to ${recipient}`,
            );
          } catch (e) {
            emailResult = {
              sent: false,
              error: String(e).substring(0, 300),
              recipient,
            };
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        bonus_unlocked_at: now,
        bonus_unlock_session_id: compSessionId,
        email: emailResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("admin-unlock-bonus error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});