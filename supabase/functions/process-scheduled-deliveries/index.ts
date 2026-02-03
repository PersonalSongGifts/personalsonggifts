import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();

    // Find orders that are ready for scheduled delivery
    // - Have a scheduled_delivery_at in the past (or now)
    // - Status is 'ready' (meaning song is uploaded but not delivered)
    // - Have a song_url
    const { data: orders, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .not("scheduled_delivery_at", "is", null)
      .lte("scheduled_delivery_at", now)
      .eq("status", "ready")
      .not("song_url", "is", null);

    if (fetchError) {
      console.error("Error fetching scheduled orders:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${orders?.length || 0} orders ready for scheduled delivery`);

    const results: Array<{ orderId: string; success: boolean; error?: string }> = [];

    for (const order of orders || []) {
      try {
        console.log(`Processing scheduled delivery for order ${order.id}`);

        // Update status to delivered first (prevents duplicate processing)
        const { error: updateError } = await supabase
          .from("orders")
          .update({
            status: "delivered",
            delivered_at: now,
          })
          .eq("id", order.id)
          .eq("status", "ready"); // Optimistic lock

        if (updateError) {
          throw updateError;
        }

        // Send delivery email
        const emailResponse = await fetch(
          `${supabaseUrl}/functions/v1/send-song-delivery`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              orderId: order.id,
              customerEmail: order.customer_email,
              customerName: order.customer_name,
              recipientName: order.recipient_name,
              occasion: order.occasion,
              songUrl: order.song_url,
            }),
          }
        );

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          console.error(`Failed to send delivery email for order ${order.id}:`, errorText);
          // Don't throw - order is already marked delivered, log the email failure
          results.push({
            orderId: order.id,
            success: true,
            error: `Email failed: ${errorText}`,
          });
        } else {
          console.log(`Successfully delivered order ${order.id}`);
          results.push({ orderId: order.id, success: true });
        }
      } catch (orderError) {
        console.error(`Error processing order ${order.id}:`, orderError);
        results.push({
          orderId: order.id,
          success: false,
          error: orderError instanceof Error ? orderError.message : "Unknown error",
        });
      }
    }

    // ---- Scheduled resends for delivered orders ----
    const { data: resendOrders, error: resendFetchError } = await supabase
      .from("orders")
      .select("*")
      .not("resend_scheduled_at", "is", null)
      .lte("resend_scheduled_at", now)
      .eq("status", "delivered")
      .not("song_url", "is", null);

    if (resendFetchError) {
      console.error("Error fetching scheduled resends:", resendFetchError);
      throw resendFetchError;
    }

    console.log(`Found ${resendOrders?.length || 0} orders ready for scheduled resend`);

    const resendResults: Array<{ orderId: string; success: boolean; error?: string }> = [];

    for (const order of resendOrders || []) {
      try {
        console.log(`Processing scheduled resend for order ${order.id}`);

        // Clear the scheduled resend first (prevents duplicate processing)
        const { error: updateError } = await supabase
          .from("orders")
          .update({
            resend_scheduled_at: null,
          })
          .eq("id", order.id)
          .not("resend_scheduled_at", "is", null); // Optimistic lock

        if (updateError) {
          throw updateError;
        }

        // Send the delivery email
        const emailResponse = await fetch(
          `${supabaseUrl}/functions/v1/send-song-delivery`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              orderId: order.id,
              customerEmail: order.customer_email,
              customerName: order.customer_name,
              recipientName: order.recipient_name,
              occasion: order.occasion,
              songUrl: order.song_url,
            }),
          }
        );

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          console.error(`Failed to send resend email for order ${order.id}:`, errorText);
          resendResults.push({
            orderId: order.id,
            success: false,
            error: `Email failed: ${errorText}`,
          });
        } else {
          console.log(`Successfully resent delivery for order ${order.id}`);
          resendResults.push({ orderId: order.id, success: true });
        }
      } catch (orderError) {
        console.error(`Error processing resend for order ${order.id}:`, orderError);
        resendResults.push({
          orderId: order.id,
          success: false,
          error: orderError instanceof Error ? orderError.message : "Unknown error",
        });
      }
    }

    // ---- Lead preview auto-sends (preview_scheduled_at) ----
    // Find leads that are due to receive their preview email
    const { data: leads, error: leadsFetchError } = await supabase
      .from("leads")
      .select("*")
      .not("preview_scheduled_at", "is", null)
      .lte("preview_scheduled_at", now)
      .is("preview_sent_at", null)
      .eq("status", "song_ready")
      .not("preview_song_url", "is", null)
      .not("preview_token", "is", null);

    if (leadsFetchError) {
      console.error("Error fetching scheduled leads:", leadsFetchError);
      throw leadsFetchError;
    }

    console.log(`Found ${leads?.length || 0} leads ready for scheduled preview send`);

    const leadResults: Array<{ leadId: string; success: boolean; error?: string }> = [];

    // Email via Brevo
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = "support@personalsonggifts.com";
    const senderName = "Personal Song Gifts";

    if (!brevoApiKey) {
      throw new Error("BREVO_API_KEY not configured");
    }

    for (const lead of leads || []) {
      try {
        if (lead.status === "converted") {
          leadResults.push({ leadId: lead.id, success: false, error: "Lead converted" });
          continue;
        }

        const previewUrl = `https://personalsonggifts.lovable.app/preview/${lead.preview_token}`;

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #FDF8F3; font-family: 'Georgia', serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #1E3A5F 0%, #2C4A6E 100%); padding: 40px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="color: #FFFFFF; margin: 0; font-size: 28px; font-weight: normal;">🎵 Your Song for ${lead.recipient_name} is Ready!</h1>
    </div>
    
    <div style="background-color: #FFFBF5; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <p style="color: #5D4E37; font-size: 18px; line-height: 1.6; margin-top: 0;">
        Hi ${lead.customer_name}!
      </p>
      
      <p style="color: #5D4E37; font-size: 16px; line-height: 1.6;">
        Great news! We've created a beautiful personalized ${lead.occasion} song just for <strong>${lead.recipient_name}</strong>.
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
    </div>
  </div>
</body>
</html>
        `;

        const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
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
            subject: `🎵 Your song for ${lead.recipient_name} is ready - listen now!`,
            htmlContent: emailHtml,
          }),
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          console.error(`Failed to send lead preview email for lead ${lead.id}:`, errorText);
          leadResults.push({ leadId: lead.id, success: false, error: errorText });
          continue;
        }

        // Mark as sent + clear schedule
        const { error: leadUpdateError } = await supabase
          .from("leads")
          .update({
            status: "preview_sent",
            preview_sent_at: now,
            preview_scheduled_at: null,
          })
          .eq("id", lead.id)
          .eq("status", "song_ready")
          .is("preview_sent_at", null);

        if (leadUpdateError) {
          console.error(`Failed to update lead ${lead.id} after sending:`, leadUpdateError);
        }

        leadResults.push({ leadId: lead.id, success: true });
      } catch (leadError) {
        console.error(`Error processing lead ${lead?.id}:`, leadError);
        leadResults.push({
          leadId: lead?.id ?? "unknown",
          success: false,
          error: leadError instanceof Error ? leadError.message : "Unknown error",
        });
      }
    }

    return new Response(
      JSON.stringify({
        processed: orders?.length || 0,
        resendsProcessed: resendOrders?.length || 0,
        leadsProcessed: leads?.length || 0,
        results,
        resendResults,
        leadResults,
        timestamp: now,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Scheduled delivery processor error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
