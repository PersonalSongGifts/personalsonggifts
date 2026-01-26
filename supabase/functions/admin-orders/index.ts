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
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    if (!adminPassword) {
      throw new Error("ADMIN_PASSWORD not configured");
    }

    // Verify admin password from header
    const providedPassword = req.headers.get("x-admin-password");
    if (providedPassword !== adminPassword) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // GET: List all orders
    if (req.method === "GET") {
      const status = url.searchParams.get("status");
      
      let query = supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const { data: orders, error } = await query;

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({ orders }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST: Update order (status, song_url, deliver)
    if (req.method === "POST") {
      const body = await req.json();
      const { orderId, status, songUrl, deliver } = body;

      if (!orderId) {
        return new Response(
          JSON.stringify({ error: "Order ID required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update order
      const updateData: Record<string, unknown> = {};
      if (status) updateData.status = status;
      if (songUrl) updateData.song_url = songUrl;

      if (deliver) {
        updateData.status = "delivered";
        updateData.delivered_at = new Date().toISOString();
      }

      const { data: order, error: updateError } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", orderId)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      // If delivering, also send the delivery email
      if (deliver && order.song_url) {
        try {
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
            console.error("Failed to send delivery email");
          }
        } catch (emailError) {
          console.error("Email error:", emailError);
        }
      }

      return new Response(
        JSON.stringify({ order }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Admin orders error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
