import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    if (!adminPassword) throw new Error("ADMIN_PASSWORD not configured");

    const { password } = await req.json();
    if (!password || password.trim() !== adminPassword.trim()) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find broken lead-converted orders: missing lyrics or wrong status
    const { data: brokenOrders, error: queryErr } = await supabase
      .from("orders")
      .select("id, customer_email, status, song_url, automation_lyrics, delivered_at, source")
      .eq("source", "lead_conversion")
      .or("automation_lyrics.is.null,status.eq.completed")
      .limit(200);

    if (queryErr) throw new Error(`Query failed: ${queryErr.message}`);

    const results: { orderId: string; actions: string[]; error?: string }[] = [];

    for (const order of brokenOrders || []) {
      const actions: string[] = [];
      try {
        // Find the original lead by order_id or email match
        let lead: any = null;

        const { data: linkedLead } = await supabase
          .from("leads")
          .select("*")
          .eq("order_id", order.id)
          .maybeSingle();

        if (linkedLead) {
          lead = linkedLead;
        } else {
          // Fallback: match by email
          const { data: emailLead } = await supabase
            .from("leads")
            .select("*")
            .ilike("email", order.customer_email)
            .eq("status", "converted")
            .order("converted_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          lead = emailLead;
        }

        if (!lead) {
          results.push({ orderId: order.id, actions: ["no_lead_found"] });
          continue;
        }

        // Build update payload with missing fields
        const update: Record<string, any> = {};

        if (!order.automation_lyrics && lead.automation_lyrics) {
          update.automation_lyrics = lead.automation_lyrics;
          actions.push("copied_lyrics");
        }

        if (!order.song_url && lead.full_song_url) {
          update.song_url = lead.full_song_url;
          actions.push("copied_song_url");
        }

        if (lead.song_title) update.song_title = lead.song_title;
        if (lead.cover_image_url) update.cover_image_url = lead.cover_image_url;
        if (lead.inputs_hash) update.inputs_hash = lead.inputs_hash;
        if (lead.lyrics_language_code) update.lyrics_language_code = lead.lyrics_language_code;
        if (lead.recipient_name_pronunciation) update.recipient_name_pronunciation = lead.recipient_name_pronunciation;
        if (lead.phone_e164) update.phone_e164 = lead.phone_e164;
        if (lead.sms_opt_in) update.sms_opt_in = lead.sms_opt_in;
        if (lead.timezone) update.timezone = lead.timezone;
        if (lead.prev_automation_lyrics) update.prev_automation_lyrics = lead.prev_automation_lyrics;
        if (lead.prev_song_url) update.prev_song_url = lead.prev_song_url;
        if (lead.prev_cover_image_url) update.prev_cover_image_url = lead.prev_cover_image_url;

        // Fix automation_status
        const hasSong = !!(order.song_url || lead.full_song_url);
        const hasLyrics = !!(order.automation_lyrics || lead.automation_lyrics);
        if (hasSong) {
          update.automation_status = "completed";
        } else if (hasLyrics) {
          update.automation_status = "lyrics_ready";
        }

        // Fix status: completed → delivered (song player requires "delivered")
        if (order.status === "completed" && hasSong) {
          update.status = "delivered";
          actions.push("fixed_status");
        }

        // Set delivered_at if missing and song exists
        if (!order.delivered_at && hasSong) {
          update.delivered_at = new Date().toISOString();
          actions.push("set_delivered_at");
        }

        if (Object.keys(update).length > 0) {
          const { error: updateErr } = await supabase
            .from("orders")
            .update(update)
            .eq("id", order.id);

          if (updateErr) {
            results.push({ orderId: order.id, actions, error: updateErr.message });
            continue;
          }
          actions.push("updated");
        }

        // Trigger lyrics generation if still missing
        if (!order.automation_lyrics && !lead.automation_lyrics && hasSong) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/automation-generate-lyrics`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({ orderId: order.id, force: true }),
            });
            actions.push("triggered_lyrics_gen");
          } catch (e) {
            actions.push("lyrics_gen_failed");
          }
        }

        results.push({ orderId: order.id, actions });
      } catch (e) {
        results.push({ orderId: order.id, actions, error: e instanceof Error ? e.message : "unknown" });
      }

      // Small delay between orders
      await new Promise((r) => setTimeout(r, 1000));
    }

    const summary = {
      totalFound: brokenOrders?.length || 0,
      totalProcessed: results.length,
      results,
    };

    console.log("[BACKFILL-LEAD-ORDERS] Complete:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[BACKFILL-LEAD-ORDERS] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
