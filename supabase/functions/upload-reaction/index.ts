import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Security limits
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime", // .mov
  "video/webm",
  "video/x-msvideo", // .avi
];
const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".avi"];

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

        // Find a delivered order for this email (allow re-submissions)
        // Using ilike for case-insensitive matching
        const { data: order, error } = await supabase
          .from("orders")
          .select("id, recipient_name, occasion, reaction_submitted_at")
          .ilike("customer_email", email.trim())
          .eq("status", "delivered")
          .order("delivered_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error || !order) {
          return new Response(
            JSON.stringify({ error: "No eligible order found for this email. Make sure your song has been delivered." }),
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

      // Security: Validate file size (100MB max)
      if (video.size > MAX_VIDEO_SIZE) {
        return new Response(
          JSON.stringify({ error: "Video must be under 100MB" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Security: Validate MIME type
      if (!ALLOWED_VIDEO_TYPES.includes(video.type)) {
        return new Response(
          JSON.stringify({ error: "Only MP4, MOV, WebM, and AVI videos are allowed" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Security: Validate file extension
      const extensionMatch = video.name.toLowerCase().match(/\.[^.]+$/);
      const extension = extensionMatch ? extensionMatch[0] : "";
      if (!ALLOWED_VIDEO_EXTENSIONS.includes(extension)) {
        return new Response(
          JSON.stringify({ error: "Invalid video file extension" }),
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

      // Case-insensitive email comparison
      if (order.customer_email.toLowerCase() !== email.trim().toLowerCase()) {
        return new Response(
          JSON.stringify({ error: "Email does not match order" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Allow re-submissions - new video will overwrite the old one
      if (order.reaction_submitted_at) {
        console.log(`Re-submitting reaction for order ${orderId} (previous: ${order.reaction_submitted_at})`);
      }

      // Use validated extension for filename
      const fileName = `${orderId}-reaction${extension}`;

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

      // Update order with reaction info - use .select() to verify the update succeeded
      const { data: updatedOrder, error: updateError } = await supabase
        .from("orders")
        .update({
          reaction_video_url: publicUrl,
          reaction_submitted_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .select("id, reaction_video_url")
        .single();

      // Verify the update actually happened
      if (updateError || !updatedOrder || !updatedOrder.reaction_video_url) {
        console.error(JSON.stringify({
          event: "reaction_db_update_failed",
          orderId,
          fileName,
          updateError: updateError?.message || "No error but update returned empty",
          updatedOrder,
          timestamp: new Date().toISOString(),
        }));
        
        // Rollback: Delete the uploaded file since DB update failed
        const { error: deleteError } = await supabase.storage
          .from("reactions")
          .remove([fileName]);
        
        if (deleteError) {
          console.error(JSON.stringify({
            event: "reaction_rollback_failed",
            orderId,
            fileName,
            deleteError: deleteError.message,
            timestamp: new Date().toISOString(),
          }));
        } else {
          console.log(JSON.stringify({
            event: "reaction_rollback_success",
            orderId,
            fileName,
            timestamp: new Date().toISOString(),
          }));
        }
        
        return new Response(
          JSON.stringify({ error: "Failed to save reaction - please try again" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Success - log structured event
      console.log(JSON.stringify({
        event: "reaction_uploaded",
        orderId,
        fileName,
        videoUrl: publicUrl,
        fileSize: video.size,
        isResubmission: !!order.reaction_submitted_at,
        timestamp: new Date().toISOString(),
      }));

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
