import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TrackRequest {
  type: "lead" | "order";
  action: "play" | "download";
  token?: string; // For leads
  orderId?: string; // For orders
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

      // Find order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id, song_played_at, song_play_count, song_downloaded_at, song_download_count")
        .eq("id", orderId)
        .single();

      if (orderError || !order) {
        console.error("Order not found:", orderId);
        return new Response(
          JSON.stringify({ error: "Order not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updates: Record<string, unknown> = {};

      if (action === "play") {
        updates.song_play_count = (order.song_play_count || 0) + 1;
        // Only set timestamp on first play
        if (!order.song_played_at) {
          updates.song_played_at = new Date().toISOString();
        }
        console.log(`Order ${order.id} play tracked (count: ${updates.song_play_count})`);
      } else if (action === "download") {
        updates.song_download_count = (order.song_download_count || 0) + 1;
        // Only set timestamp on first download
        if (!order.song_downloaded_at) {
          updates.song_downloaded_at = new Date().toISOString();
        }
        console.log(`Order ${order.id} download tracked (count: ${updates.song_download_count})`);
      }

      const { error: updateError } = await supabase
        .from("orders")
        .update(updates)
        .eq("id", order.id);

      if (updateError) {
        console.error("Failed to update order tracking:", updateError);
        throw updateError;
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
