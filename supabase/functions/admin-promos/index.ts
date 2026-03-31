import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function computeStatus(promo: any): string {
  const now = new Date();
  const starts = new Date(promo.starts_at);
  const ends = new Date(promo.ends_at);
  if (!promo.is_active) return "inactive";
  if (now < starts) return "upcoming";
  if (now > ends) return "expired";
  return "active";
}

async function getEligibleLeadsQuery(supabase: any, promoId: string, emailLeadsDays: number) {
  // Get the promo to check last_promo_email_sent_at filtering
  const { data: leads, error } = await supabase.rpc("get_promo_eligible_leads", {
    p_days: emailLeadsDays,
  });

  // Since we can't use RPC that doesn't exist, do it with raw queries
  // We'll use multiple queries to build the exclusion list

  // 1. Get suppressed emails
  const { data: suppressions } = await supabase
    .from("email_suppressions")
    .select("email");
  const suppressedSet = new Set(
    (suppressions || []).map((s: any) => s.email?.toLowerCase().trim())
  );

  // 2. Get all order customer emails (to exclude existing customers)
  const { data: orderEmails } = await supabase
    .from("orders")
    .select("customer_email");
  const customerSet = new Set(
    (orderEmails || []).map((o: any) => o.customer_email?.toLowerCase().trim())
  );

  // 3. Get eligible leads
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - emailLeadsDays);

  const { data: eligibleLeads, error: leadsErr } = await supabase
    .from("leads")
    .select("id, email, customer_name, recipient_name, occasion, preview_token, last_promo_email_sent_at")
    .neq("status", "converted")
    .gte("captured_at", cutoffDate.toISOString())
    .is("last_promo_email_sent_at", null)
    .not("preview_token", "is", null);

  if (leadsErr) {
    console.error("Leads query error:", leadsErr);
    return [];
  }

  // Filter out suppressed and existing customers using normalized email
  return (eligibleLeads || []).filter((lead: any) => {
    const normalizedEmail = lead.email?.toLowerCase().trim();
    return normalizedEmail && !suppressedSet.has(normalizedEmail) && !customerSet.has(normalizedEmail);
  });
}

async function sendPromoEmail(
  brevoApiKey: string,
  toEmail: string,
  customerName: string,
  recipientName: string,
  previewToken: string,
  promoSlug: string,
  emailSubject: string,
  emailBodyTemplate: string,
  origin: string,
): Promise<boolean> {
  const ctaUrl = `${origin}/preview/${previewToken}?promo=${promoSlug}`;
  const unsubscribeUrl = `${origin}/unsubscribe`;

  // Replace template variables
  let htmlBody = emailBodyTemplate
    .replace(/\{\{customer_name\}\}/g, customerName)
    .replace(/\{\{recipient_name\}\}/g, recipientName)
    .replace(/\{\{cta_url\}\}/g, ctaUrl);

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${emailSubject}</title></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#222;font-size:15px;line-height:1.6;">
<div style="max-width:580px;margin:0 auto;padding:40px 20px;">

${htmlBody}

<p style="color:#999;font-size:12px;margin-top:32px;padding-top:16px;border-top:1px solid #eee;">If you have already purchased, please ignore this email.<br>
<a href="${unsubscribeUrl}" style="color:#999;">unsubscribe</a></p>

</div>
</body></html>`;

  const textContent = htmlBody.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ") +
    `\n\nIf you have already purchased, please ignore this email.\nunsubscribe: ${unsubscribeUrl}`;

  const subject = emailSubject
    .replace(/\{\{customer_name\}\}/g, customerName)
    .replace(/\{\{recipient_name\}\}/g, recipientName);

  const messageId = `promo-${promoSlug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@personalsonggifts.com`;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": brevoApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Personal Song Gifts", email: "support@personalsonggifts.com" },
      to: [{ email: toEmail, name: customerName }],
      subject,
      htmlContent,
      textContent,
      headers: {
        "Precedence": "transactional",
        "List-Unsubscribe": `<mailto:support@personalsonggifts.com?subject=unsubscribe>, <${unsubscribeUrl}>`,
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const origin = req.headers.get("origin") || "https://personalsonggifts.lovable.app";

    // GET: list all promos
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("promotions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const promos = (data || []).map((p: any) => ({
        ...p,
        computed_status: computeStatus(p),
      }));

      return new Response(
        JSON.stringify({ promos }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST: various actions
    if (req.method === "POST") {
      const body = await req.json();
      const { action } = body;

      // --- LIST PROMOS ---
      if (action === "list") {
        const { data, error } = await supabase
          .from("promotions")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;

        const promos = (data || []).map((p: any) => ({
          ...p,
          computed_status: computeStatus(p),
        }));

        return new Response(
          JSON.stringify({ promos }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // --- UPSERT PROMO ---
      if (action === "upsert") {
        const { promo } = body;
        if (!promo) {
          return new Response(
            JSON.stringify({ error: "Missing promo data" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate
        if (!promo.name || !promo.slug || !promo.starts_at || !promo.ends_at) {
          return new Response(
            JSON.stringify({ error: "Missing required fields: name, slug, starts_at, ends_at" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (promo.standard_price_cents <= 0 || promo.priority_price_cents <= 0 || promo.lead_price_cents <= 0) {
          return new Response(
            JSON.stringify({ error: "All prices must be greater than 0" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (new Date(promo.starts_at) >= new Date(promo.ends_at)) {
          return new Response(
            JSON.stringify({ error: "Start date must be before end date" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (!/^[a-z0-9-]+$/.test(promo.slug)) {
          return new Response(
            JSON.stringify({ error: "Slug must be URL-safe (lowercase letters, numbers, hyphens only)" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const upsertData: any = {
          name: promo.name,
          slug: promo.slug,
          standard_price_cents: promo.standard_price_cents,
          priority_price_cents: promo.priority_price_cents,
          lead_price_cents: promo.lead_price_cents,
          starts_at: promo.starts_at,
          ends_at: promo.ends_at,
          is_active: promo.is_active ?? false,
          show_banner: promo.show_banner ?? true,
          banner_text: promo.banner_text || null,
          banner_emoji: promo.banner_emoji || null,
          email_leads: promo.email_leads ?? false,
          email_leads_days: promo.email_leads_days ?? 30,
          email_subject: promo.email_subject || null,
          email_body_template: promo.email_body_template || null,
          banner_bg_color: promo.banner_bg_color || null,
          banner_text_color: promo.banner_text_color || null,
        };

        let result;
        if (promo.id) {
          // Update
          const { data, error } = await supabase
            .from("promotions")
            .update(upsertData)
            .eq("id", promo.id)
            .select()
            .single();
          if (error) throw error;
          result = data;
        } else {
          // Insert
          const { data, error } = await supabase
            .from("promotions")
            .insert(upsertData)
            .select()
            .single();
          if (error) throw error;
          result = data;
        }

        return new Response(
          JSON.stringify({ promo: result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // --- TOGGLE ACTIVE ---
      if (action === "toggle_active") {
        const { id, is_active } = body;
        const { data, error } = await supabase
          .from("promotions")
          .update({ is_active })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;

        return new Response(
          JSON.stringify({ promo: data }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // --- DRY RUN ---
      if (action === "dry_run_lead_emails") {
        const { promo_id } = body;
        const { data: promo } = await supabase
          .from("promotions")
          .select("*")
          .eq("id", promo_id)
          .single();

        if (!promo) {
          return new Response(
            JSON.stringify({ error: "Promo not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const eligible = await getEligibleLeadsQuery(supabase, promo_id, promo.email_leads_days);

        return new Response(
          JSON.stringify({
            eligibleCount: eligible.length,
            sampleEmails: eligible.slice(0, 10).map((l: any) => l.email),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // --- SEND LEAD EMAILS ---
      if (action === "send_lead_emails") {
        const { promo_id } = body;
        const { data: promo } = await supabase
          .from("promotions")
          .select("*")
          .eq("id", promo_id)
          .single();

        if (!promo) {
          return new Response(
            JSON.stringify({ error: "Promo not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!promo.email_subject || !promo.email_body_template) {
          return new Response(
            JSON.stringify({ error: "Email subject and body template are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const brevoApiKey = Deno.env.get("BREVO_API_KEY") || "";
        if (!brevoApiKey) {
          return new Response(
            JSON.stringify({ error: "BREVO_API_KEY not configured" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const eligible = await getEligibleLeadsQuery(supabase, promo_id, promo.email_leads_days);

        // Update batch total
        await supabase
          .from("promotions")
          .update({ email_batch_total: eligible.length, email_batch_sent: 0 })
          .eq("id", promo_id);

        let sent = 0;
        const BATCH_SIZE = 50;

        for (let i = 0; i < eligible.length; i++) {
          // Kill switch: check if promo is still active every 50 emails
          if (i > 0 && i % BATCH_SIZE === 0) {
            const { data: currentPromo } = await supabase
              .from("promotions")
              .select("is_active")
              .eq("id", promo_id)
              .single();
            if (!currentPromo?.is_active) {
              console.log("Promo deactivated — stopping email blast");
              break;
            }
          }

          const lead = eligible[i];
          const success = await sendPromoEmail(
            brevoApiKey,
            lead.email,
            lead.customer_name || "there",
            lead.recipient_name || "your loved one",
            lead.preview_token,
            promo.slug,
            promo.email_subject,
            promo.email_body_template,
            origin,
          );

          if (success) {
            sent++;
            // Mark lead as having received promo email
            await supabase
              .from("leads")
              .update({ last_promo_email_sent_at: new Date().toISOString() })
              .eq("id", lead.id);
          }

          // Update progress every 10 emails
          if (sent % 10 === 0) {
            await supabase
              .from("promotions")
              .update({ email_batch_sent: sent })
              .eq("id", promo_id);
          }
        }

        // Final progress update
        await supabase
          .from("promotions")
          .update({ email_batch_sent: sent })
          .eq("id", promo_id);

        return new Response(
          JSON.stringify({ sent, total: eligible.length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Unknown action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("admin-promos error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
