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

    const contentType = req.headers.get("content-type") || "";
    
    // Handle JSON request (lookup action)
    if (contentType.includes("application/json")) {
      const { action, email } = await req.json();
      
      if (action === "lookup") {
        if (!email) {
          return new Response(
            JSON.stringify({ error: "Email is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Find a delivered order for this email that hasn't submitted a reaction yet
        const { data: order, error } = await supabase
          .from("orders")
          .select("id, recipient_name, occasion, reaction_submitted_at")
          .ilike("customer_email", email.trim())
          .eq("status", "delivered")
          .is("reaction_submitted_at", null)
          .order("delivered_at", { ascending: false })
          .limit(1)
          .single();

        if (error || !order) {
          return new Response(
            JSON.stringify({ error: "No eligible order found for this email. Make sure your song has been delivered and you haven't already submitted a reaction." }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            orderId: order.id,
            recipientName: order.recipient_name,
            occasion: order.occasion,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Handle FormData request (upload action)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const action = formData.get("action");
      const email = formData.get("email") as string;
      const orderId = formData.get("orderId") as string;
      const video = formData.get("video") as File;

      if (action !== "upload") {
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!email || !orderId || !video) {
        return new Response(
          JSON.stringify({ error: "Email, order ID, and video are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify the order belongs to this email and hasn't already submitted
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id, customer_email, reaction_submitted_at")
        .eq("id", orderId)
        .single();

      if (orderError || !order) {
        return new Response(
          JSON.stringify({ error: "Order not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (order.customer_email.toLowerCase() !== email.trim().toLowerCase()) {
        return new Response(
          JSON.stringify({ error: "Email does not match order" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (order.reaction_submitted_at) {
        return new Response(
          JSON.stringify({ error: "A reaction video has already been submitted for this order" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get file extension
      const extension = video.name.split(".").pop() || "mp4";
      const fileName = `${orderId}-reaction.${extension}`;

      // Upload to reactions bucket
      const arrayBuffer = await video.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from("reactions")
        .upload(fileName, arrayBuffer, {
          contentType: video.type,
          upsert: true,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        return new Response(
          JSON.stringify({ error: "Failed to upload video" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("reactions")
        .getPublicUrl(fileName);

      // Update order with reaction info
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          reaction_video_url: publicUrl,
          reaction_submitted_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (updateError) {
        console.error("Update error:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to save reaction info" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Reaction video uploaded for order ${orderId}: ${publicUrl}`);

      return new Response(
        JSON.stringify({ success: true, videoUrl: publicUrl }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid request format" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Upload reaction error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
