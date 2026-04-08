import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TrackRequest {
  type: "lead" | "order";
  action: "play" | "download" | "error" | "bonus_play" | "bonus_checkout_click";
  token?: string; // For leads
  orderId?: string; // For orders
  errorDetails?: {
    errorName: string;
    errorMessage: string;
    userAgent: string;
    online: boolean;
    songUrlHost: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: TrackRequest = await req.json();
    const { type, action, token, orderId } = body;

    if (!type || !action) {
      return new Response(
        JSON.stringify({ error: "Missing type or action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (type === "lead") {
      if (!token) {
        return new Response(
          JSON.stringify({ error: "Missing token for lead tracking" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find lead by preview token
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select("id, preview_played_at, preview_play_count")
        .eq("preview_token", token)
        .single();

      if (leadError || !lead) {
        console.error("Lead not found for token:", token);
        return new Response(
          JSON.stringify({ error: "Lead not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "play") {
        const updates: Record<string, unknown> = {
          preview_play_count: (lead.preview_play_count || 0) + 1,
        };

        // Only set timestamp on first play
        if (!lead.preview_played_at) {
          updates.preview_played_at = new Date().toISOString();
        }

        const { error: updateError } = await supabase
          .from("leads")
          .update(updates)
          .eq("id", lead.id);

        if (updateError) {
          console.error("Failed to update lead play tracking:", updateError);
          throw updateError;
        }

        console.log(`Lead ${lead.id} play tracked (count: ${updates.preview_play_count})`);
      } else if (action === "error") {
        // Log playback error for diagnostics
        const { errorDetails } = body;
        
        const { error: insertError } = await supabase.from("playback_errors").insert({
          entity_type: "lead",
          entity_id: lead.id,
          error_name: errorDetails?.errorName || "Unknown",
          error_message: errorDetails?.errorMessage || null,
          user_agent: errorDetails?.userAgent || null,
          is_online: errorDetails?.online ?? null,
          song_url_host: errorDetails?.songUrlHost || null,
        });

        if (insertError) {
          console.error("Failed to insert playback error:", insertError);
          // Don't throw - error tracking should not fail the request
        } else {
          console.log(`Lead ${lead.id} playback error tracked: ${errorDetails?.errorName}`);
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (type === "order") {
      if (!orderId) {
        return new Response(
          JSON.stringify({ error: "Missing orderId for order tracking" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Resolve short ID (8 chars) or full UUID
      const isShortId = orderId.length === 8;
      const isFullUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);

      if (!isShortId && !isFullUUID) {
        return new Response(
          JSON.stringify({ error: "Invalid order ID format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let order: Record<string, unknown> | null = null;

      if (isShortId) {
        const { data: orders, error: fetchError } = await supabase
          .rpc("find_orders_by_short_id", {
            short_id: orderId,
            status_filter: null,
            require_song_url: false,
            max_results: 2,
          });

        if (fetchError) {
          console.error("Failed to fetch orders for short ID resolution:", fetchError);
          throw fetchError;
        }

        if (orders && orders.length === 1) {
          order = orders[0];
        } else if (orders && orders.length > 1) {
          return new Response(
            JSON.stringify({ error: "Ambiguous ID" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        // Full UUID: direct lookup
        const { data, error: fetchError } = await supabase
          .from("orders")
          .select("id, song_played_at, song_play_count, song_downloaded_at, song_download_count, bonus_play_count, bonus_first_played_at, bonus_checkout_click_count, bonus_checkout_clicked_at")
          .eq("id", orderId)
          .maybeSingle();

        if (fetchError) {
          console.error("Failed to fetch order:", fetchError);
          throw fetchError;
        }
        order = data;
      }

      if (!order) {
        console.error("Order not found:", orderId);
        return new Response(
          JSON.stringify({ error: "Order not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Resolved order ID: ${orderId} -> ${order.id}`);

      const updates: Record<string, unknown> = {};

      if (action === "play") {
        updates.song_play_count = ((order.song_play_count as number) || 0) + 1;
        if (!order.song_played_at) {
          updates.song_played_at = new Date().toISOString();
        }
        console.log(`Order ${order.id} play tracked (count: ${updates.song_play_count})`);
      } else if (action === "bonus_play") {
        updates.bonus_play_count = ((order.bonus_play_count as number) || 0) + 1;
        if (!order.bonus_first_played_at) {
          updates.bonus_first_played_at = new Date().toISOString();
        }
        console.log(`Order ${order.id} bonus play tracked (count: ${updates.bonus_play_count})`);
      } else if (action === "bonus_checkout_click") {
        updates.bonus_checkout_click_count = ((order.bonus_checkout_click_count as number) || 0) + 1;
        if (!order.bonus_checkout_clicked_at) {
          updates.bonus_checkout_clicked_at = new Date().toISOString();
        }
        console.log(`Order ${order.id} bonus checkout click tracked (count: ${updates.bonus_checkout_click_count})`);
      } else if (action === "download") {
        updates.song_download_count = (order.song_download_count || 0) + 1;
        // Only set timestamp on first download
        if (!order.song_downloaded_at) {
          updates.song_downloaded_at = new Date().toISOString();
        }
        console.log(`Order ${order.id} download tracked (count: ${updates.song_download_count})`);
      } else if (action === "error") {
        // Log playback error for diagnostics
        const { errorDetails } = body;
        
        const { error: insertError } = await supabase.from("playback_errors").insert({
          entity_type: "order",
          entity_id: order.id,
          error_name: errorDetails?.errorName || "Unknown",
          error_message: errorDetails?.errorMessage || null,
          user_agent: errorDetails?.userAgent || null,
          is_online: errorDetails?.online ?? null,
          song_url_host: errorDetails?.songUrlHost || null,
        });

        if (insertError) {
          console.error("Failed to insert playback error:", insertError);
          // Don't throw - error tracking should not fail the request
        } else {
          console.log(`Order ${order.id} playback error tracked: ${errorDetails?.errorName}`);
        }
        
        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Only update if we have updates (play or download actions)
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from("orders")
          .update(updates)
          .eq("id", order.id);

        if (updateError) {
          console.error("Failed to update order tracking:", updateError);
          throw updateError;
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid type" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Track engagement error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
