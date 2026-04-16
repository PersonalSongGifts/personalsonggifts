import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { getActivePromoForBanner, renderPromoBannerHtml, renderPromoBannerText, PromoBannerData } from "../_shared/email-promo-banner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

const DEFAULT_SETTINGS = {
  paused: true,
  batch_size: 500,
  canary_size: 100,
  canary_sent: false,
  total_sent: 0,
  last_run_at: null as string | null,
};

interface CampaignSettings {
  paused: boolean;
  batch_size: number;
  canary_size: number;
  canary_sent: boolean;
  total_sent: number;
  last_run_at: string | null;
}

async function getCampaignSettings(supabase: ReturnType<typeof createClient>): Promise<CampaignSettings> {
  const { data } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "valentine_remarketing")
    .maybeSingle();

  if (!data?.value) return { ...DEFAULT_SETTINGS };

  try {
    const parsed = JSON.parse(data.value);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function updateCampaignSettings(supabase: ReturnType<typeof createClient>, updates: Partial<CampaignSettings>) {
  const current = await getCampaignSettings(supabase);
  const merged = { ...current, ...updates };
  await supabase
    .from("admin_settings")
    .upsert({
      key: "valentine_remarketing",
      value: JSON.stringify(merged),
      updated_at: new Date().toISOString(),
    });
  return merged;
}

async function isPaused(supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const settings = await getCampaignSettings(supabase);
  return settings.paused;
}

function buildEmailHtml(customerName: string, recipientName: string, occasion: string, previewToken: string, origin: string): string {
  const ctaUrl = `${origin}/preview/${previewToken}?vday10=true`;
  const unsubscribeUrl = `${origin}/unsubscribe`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>You have an unread message</title></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#222;font-size:15px;line-height:1.6;">
<div style="max-width:580px;margin:0 auto;padding:40px 20px;">

<p>Hi ${customerName},</p>

<p>Valentine's Day is coming up and the best part is that ${recipientName}'s personalized song is already finished. What better way to express how you feel than with a song made just for them?</p>

<p>Listen to a preview here:<br>
<a href="${ctaUrl}" style="color:#1a73e8;">${ctaUrl}</a></p>

<p>
- Full-length studio version<br>
- Instant download<br>
- Guaranteed delivery before Valentine's Day<br>
- $10 Valentine's bonus applied automatically at checkout
</p>

<p>No shipping, no waiting — delivered instantly.</p>

<p>— The Personal Song Gifts Team</p>

<p style="color:#999;font-size:12px;margin-top:32px;padding-top:16px;border-top:1px solid #eee;">If you have already purchased, please ignore this email.<br>
<a href="${unsubscribeUrl}" style="color:#999;">unsubscribe</a></p>

</div>
</body></html>`;
}

function buildPlainText(customerName: string, recipientName: string, occasion: string, previewToken: string, origin: string): string {
  const ctaUrl = `${origin}/preview/${previewToken}?vday10=true`;
  const unsubscribeUrl = `${origin}/unsubscribe`;

  return `Hi ${customerName},

Valentine's Day is coming up and the best part is that ${recipientName}'s personalized song is already finished. What better way to express how you feel than with a song made just for them?

Listen to a preview here:
${ctaUrl}

- Full-length studio version
- Instant download
- Guaranteed delivery before Valentine's Day
- $10 Valentine's bonus applied automatically at checkout

No shipping, no waiting — delivered instantly.

— The Personal Song Gifts Team

If you have already purchased, please ignore this email.
unsubscribe: ${unsubscribeUrl}`;
}

async function sendEmail(
  brevoApiKey: string,
  senderEmail: string,
  senderName: string,
  toEmail: string,
  customerName: string,
  recipientName: string,
  occasion: string,
  previewToken: string,
  origin: string,
): Promise<boolean> {
  const htmlContent = buildEmailHtml(customerName, recipientName, occasion, previewToken, origin);
  const textContent = buildPlainText(customerName, recipientName, occasion, previewToken, origin);
  const unsubscribeUrl = `${origin}/unsubscribe`;
  const messageId = `vday-remarket-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@personalsonggifts.com`;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": brevoApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: toEmail, name: customerName }],
      subject: "You have an unread message from Personal Song Gifts",
      htmlContent,
      textContent,
      headers: {
        "Precedence": "transactional",
        "List-Unsubscribe": `<mailto:${senderEmail}?subject=unsubscribe>, <${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "Message-ID": `<${messageId}>`,
        "X-Entity-Ref-ID": messageId,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`Brevo send failed for ${toEmail}: ${response.status} ${errText}`);
    return false;
  }

  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Admin auth
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    const providedPassword = req.headers.get("x-admin-password");

    if (!adminPassword || providedPassword !== adminPassword) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { dryRun, testEmails, send } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const brevoApiKey = Deno.env.get("BREVO_API_KEY") || "";
    const senderEmail = "support@personalsonggifts.com";
    const senderName = "Personal Song Gifts";
    const origin = req.headers.get("origin") || "https://personalsonggifts.lovable.app";

    // ---- DRY RUN ----
    if (dryRun) {
      const { data: eligible, error: qErr } = await supabase
        .from("leads")
        .select("id, email, customer_name, recipient_name, occasion, preview_token, quality_score, status", { count: "exact" })
        .not("preview_sent_at", "is", null)
        .neq("status", "converted")
        .gte("quality_score", 30)
        .not("preview_token", "is", null)
        .is("last_valentine_remarketing_sent_at", null)
        .limit(10);

      if (qErr) throw qErr;

      // Count total eligible (separate count query)
      const { count } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .not("preview_sent_at", "is", null)
        .neq("status", "converted")
        .gte("quality_score", 30)
        .not("preview_token", "is", null)
        .is("last_valentine_remarketing_sent_at", null);

      // Check suppression count
      const { count: suppressedCount } = await supabase
        .from("email_suppressions")
        .select("email", { count: "exact", head: true });

      return new Response(
        JSON.stringify({
          dryRun: true,
          totalEligible: count || 0,
          suppressedEmails: suppressedCount || 0,
          sample: (eligible || []).map(l => ({
            email: l.email,
            customer_name: l.customer_name,
            recipient_name: l.recipient_name,
            occasion: l.occasion,
            quality_score: l.quality_score,
            has_token: !!l.preview_token,
          })),
          note: "Suppressed emails and paid customers will be excluded at send time.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- TEST MODE ----
    if (testEmails && Array.isArray(testEmails) && testEmails.length > 0) {
      const results: { email: string; sent: boolean; error?: string }[] = [];

      for (const email of testEmails) {
        // Try to find a real lead for this email
        const { data: lead } = await supabase
          .from("leads")
          .select("id, email, customer_name, recipient_name, occasion, preview_token")
          .eq("email", email)
          .not("preview_token", "is", null)
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Fallback: find any lead with a valid preview token for test
        let testToken = lead?.preview_token;
        let testName = lead?.customer_name || "Test User";
        let testRecipient = lead?.recipient_name || "Valentine";
        let testOccasion = lead?.occasion || "Valentine's Day";

        if (!testToken) {
          const { data: anyLead } = await supabase
            .from("leads")
            .select("preview_token, customer_name, recipient_name, occasion")
            .not("preview_token", "is", null)
            .not("full_song_url", "is", null)
            .limit(1)
            .maybeSingle();

          testToken = anyLead?.preview_token || "test-token";
          if (anyLead) {
            testName = lead?.customer_name || "Test User";
            testRecipient = anyLead.recipient_name;
            testOccasion = anyLead.occasion;
          }
        }

        try {
          const success = await sendEmail(
            brevoApiKey, senderEmail, senderName,
            email, testName, testRecipient, testOccasion, testToken, origin
          );
          results.push({ email, sent: success, error: success ? undefined : "Brevo rejected" });
        } catch (err) {
          results.push({ email, sent: false, error: err instanceof Error ? err.message : "Unknown error" });
        }
      }

      return new Response(
        JSON.stringify({
          testMode: true,
          results,
          totalSent: results.filter(r => r.sent).length,
          totalFailed: results.filter(r => !r.sent).length,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- PRODUCTION SEND ----
    if (send) {
      // Check paused flag
      const settings = await getCampaignSettings(supabase);
      if (settings.paused) {
        return new Response(
          JSON.stringify({ paused: true, message: "Campaign is paused. Resume from admin panel." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Determine batch size
      const batchSize = settings.canary_sent ? settings.batch_size : settings.canary_size;

      // Fetch eligible leads with suppression and paid-order exclusion via raw RPC
      // We use the Supabase client filters + post-filtering for suppression/orders
      const { data: candidates, error: fetchErr } = await supabase
        .from("leads")
        .select("id, email, customer_name, recipient_name, occasion, preview_token")
        .not("preview_sent_at", "is", null)
        .neq("status", "converted")
        .gte("quality_score", 30)
        .not("preview_token", "is", null)
        .is("last_valentine_remarketing_sent_at", null)
        .limit(batchSize * 2); // Fetch extra to account for filtering

      if (fetchErr) throw fetchErr;
      if (!candidates || candidates.length === 0) {
        return new Response(
          JSON.stringify({ send: true, eligible: 0, attempted: 0, sent: 0, failed: 0, remaining: 0, message: "No eligible leads remaining." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Filter out suppressed emails
      const candidateEmails = candidates.map(c => c.email.toLowerCase());
      const { data: suppressed } = await supabase
        .from("email_suppressions")
        .select("email")
        .in("email", candidateEmails);
      const suppressedSet = new Set((suppressed || []).map(s => s.email));

      // Filter out leads with paid orders
      const { data: paidOrders } = await supabase
        .from("orders")
        .select("customer_email")
        .in("customer_email", candidateEmails)
        .neq("status", "cancelled");
      const paidSet = new Set((paidOrders || []).map(o => o.customer_email.toLowerCase()));

      const eligible = candidates.filter(c => {
        const emailLower = c.email.toLowerCase();
        return !suppressedSet.has(emailLower) && !paidSet.has(emailLower);
      }).slice(0, batchSize);

      let totalSent = 0;
      let totalFailed = 0;
      const errors: { email: string; error: string }[] = [];
      const CHUNK_SIZE = 50;

      for (let i = 0; i < eligible.length; i += CHUNK_SIZE) {
        // Check pause flag between chunks
        if (i > 0) {
          const stillPaused = await isPaused(supabase);
          if (stillPaused) {
            console.log(`Campaign paused mid-run after ${totalSent} sends`);
            await updateCampaignSettings(supabase, {
              total_sent: settings.total_sent + totalSent,
              last_run_at: new Date().toISOString(),
              canary_sent: true,
            });
            return new Response(
              JSON.stringify({
                send: true,
                pausedMidRun: true,
                eligible: eligible.length,
                attempted: i,
                sent: totalSent,
                failed: totalFailed,
                remaining: eligible.length - i,
                errors,
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Rate limit between chunks
          await new Promise(r => setTimeout(r, 500));
        }

        const chunk = eligible.slice(i, i + CHUNK_SIZE);

        for (const lead of chunk) {
          // Claim: set timestamp before sending
          const { error: claimErr } = await supabase
            .from("leads")
            .update({ last_valentine_remarketing_sent_at: new Date().toISOString() })
            .eq("id", lead.id)
            .is("last_valentine_remarketing_sent_at", null);

          if (claimErr) {
            console.error(`Claim failed for ${lead.id}:`, claimErr);
            totalFailed++;
            errors.push({ email: lead.email, error: "Claim failed" });
            continue;
          }

          try {
            const success = await sendEmail(
              brevoApiKey, senderEmail, senderName,
              lead.email, lead.customer_name, lead.recipient_name,
              lead.occasion, lead.preview_token!, origin
            );

            if (success) {
              totalSent++;
            } else {
              // Clear claim on failure
              await supabase
                .from("leads")
                .update({ last_valentine_remarketing_sent_at: null })
                .eq("id", lead.id);
              totalFailed++;
              errors.push({ email: lead.email, error: "Brevo rejected" });
            }
          } catch (err) {
            // Clear claim on failure
            await supabase
              .from("leads")
              .update({ last_valentine_remarketing_sent_at: null })
              .eq("id", lead.id);
            totalFailed++;
            errors.push({ email: lead.email, error: err instanceof Error ? err.message : "Unknown" });
          }
        }
      }

      // Update campaign settings
      await updateCampaignSettings(supabase, {
        total_sent: settings.total_sent + totalSent,
        last_run_at: new Date().toISOString(),
        canary_sent: true,
      });

      // Count remaining
      const { count: remainingCount } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .not("preview_sent_at", "is", null)
        .neq("status", "converted")
        .gte("quality_score", 30)
        .not("preview_token", "is", null)
        .is("last_valentine_remarketing_sent_at", null);

      const totalEligible = (remainingCount || 0) + settings.total_sent + totalSent;

      return new Response(
        JSON.stringify({
          send: true,
          eligible: eligible.length,
          attempted: eligible.length,
          sent: totalSent,
          failed: totalFailed,
          remaining: remainingCount || 0,
          totalEligible,
          errors: errors.slice(0, 20),
          canaryBatch: !settings.canary_sent,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Provide dryRun, testEmails, or send parameter" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Valentine remarketing error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
