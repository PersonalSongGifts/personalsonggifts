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

    return new Response(
      JSON.stringify({
        processed: orders?.length || 0,
        results,
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
