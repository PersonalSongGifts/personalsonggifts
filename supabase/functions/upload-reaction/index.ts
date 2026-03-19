import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Security limits
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime", // .mov
  "video/webm",
];
const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"];
const MAX_UPLOADS_PER_EMAIL_24H = 3;

function validateVideo(video: File): string | null {
  if (video.size > MAX_VIDEO_SIZE) {
    return "Video must be under 2GB";
  }
  if (!ALLOWED_VIDEO_TYPES.includes(video.type)) {
    return "Only MP4, MOV, and WebM videos are allowed";
  }
  const extensionMatch = video.name.toLowerCase().match(/\.[^.]+$/);
  const extension = extensionMatch ? extensionMatch[0] : "";
  if (!ALLOWED_VIDEO_EXTENSIONS.includes(extension)) {
    return "Invalid video file extension";
  }
  return null;
}

function getExtension(filename: string): string {
  const match = filename.toLowerCase().match(/\.[^.]+$/);
  return match ? match[0] : ".mp4";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const contentType = req.headers.get("content-type") || "";

    // Handle JSON request (lookup or link-reaction action)
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const { action, email } = body;

      if (action === "lookup") {
        if (!email) {
          return new Response(
            JSON.stringify({ error: "Email is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

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

      // ── link-reaction action (client uploaded directly to storage) ──
      if (action === "link-reaction") {
        const linkEmail = (body.email as string)?.trim();
        const linkName = (body.name as string)?.trim();
        const linkOrderId = (body.orderId as string)?.trim() || null;
        const linkFileName = (body.fileName as string)?.trim();

        if (!linkEmail || !linkName || !linkFileName) {
          return new Response(
            JSON.stringify({ error: "Email, name, and fileName are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Verify the file exists in storage
        const { data: fileData } = await supabase.storage
          .from("reactions")
          .list("", { search: linkFileName, limit: 1 });

        if (!fileData || fileData.length === 0) {
          return new Response(
            JSON.stringify({ error: "Video file not found in storage" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Rate limit: max 3 uploads per email in 24h
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recentUploads } = await supabase
          .from("orders")
          .select("id")
          .ilike("customer_email", linkEmail)
          .gte("reaction_submitted_at", twentyFourHoursAgo)
          .limit(MAX_UPLOADS_PER_EMAIL_24H);

        if (recentUploads && recentUploads.length >= MAX_UPLOADS_PER_EMAIL_24H) {
          await supabase.storage.from("reactions").remove([linkFileName]);
          return new Response(
            JSON.stringify({ error: "You've reached the upload limit. Please try again tomorrow." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let linkedOrderId: string | null = null;

        if (linkOrderId) {
          const { data: order } = await supabase
            .from("orders")
            .select("id, customer_email")
            .eq("id", linkOrderId)
            .maybeSingle();

          if (order && order.customer_email.toLowerCase() === linkEmail.toLowerCase()) {
            linkedOrderId = order.id;
          } else {
            console.log(JSON.stringify({
              event: "link_reaction_order_mismatch",
              email: linkEmail, orderId: linkOrderId, timestamp: new Date().toISOString(),
            }));
          }
        } else {
          const { data: orders } = await supabase
            .from("orders")
            .select("id")
            .ilike("customer_email", linkEmail)
            .eq("status", "delivered")
            .order("delivered_at", { ascending: false })
            .limit(3);

          if (orders && orders.length === 1) {
            linkedOrderId = orders[0].id;
          } else if (orders && orders.length >= 2) {
            console.log(JSON.stringify({
              event: "link_reaction_needs_manual_match",
              email: linkEmail, name: linkName, fileName: linkFileName,
              orderCount: orders.length, timestamp: new Date().toISOString(),
            }));
          }
        }

        const { data: { publicUrl } } = supabase.storage
          .from("reactions")
          .getPublicUrl(linkFileName);

        if (linkedOrderId) {
          const { data: updatedOrder, error: updateError } = await supabase
            .from("orders")
            .update({
              reaction_video_url: publicUrl,
              reaction_submitted_at: new Date().toISOString(),
            })
            .eq("id", linkedOrderId)
            .select("id, reaction_video_url")
            .single();

          if (updateError || !updatedOrder || !updatedOrder.reaction_video_url) {
            console.error(JSON.stringify({
              event: "link_reaction_db_update_failed",
              linkedOrderId, fileName: linkFileName,
              updateError: updateError?.message || "empty result",
              timestamp: new Date().toISOString(),
            }));
            await supabase.storage.from("reactions").remove([linkFileName]);
            return new Response(
              JSON.stringify({ error: "Failed to save reaction — please try again" }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          console.log(JSON.stringify({
            event: "link_reaction_unlinked",
            email: linkEmail, name: linkName, fileName: linkFileName, publicUrl,
            timestamp: new Date().toISOString(),
          }));
        }

        console.log(JSON.stringify({
          event: "link_reaction_success",
          email: linkEmail, name: linkName, fileName: linkFileName, linkedOrderId,
          timestamp: new Date().toISOString(),
        }));

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Handle FormData request (upload or direct-upload action)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const action = formData.get("action") as string;
      const email = (formData.get("email") as string)?.trim();
      const video = formData.get("video") as File;

      // ── direct-upload action (new /share-reaction page) ──
      if (action === "direct-upload") {
        const name = (formData.get("name") as string)?.trim();
        const orderId = (formData.get("orderId") as string)?.trim() || null;

        if (!name || !email || !video) {
          return new Response(
            JSON.stringify({ error: "Name, email, and video are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate video
        const videoError = validateVideo(video);
        if (videoError) {
          return new Response(
            JSON.stringify({ error: videoError }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Rate limit: max 3 uploads per email in 24h
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recentUploads } = await supabase
          .from("orders")
          .select("id")
          .ilike("customer_email", email)
          .gte("reaction_submitted_at", twentyFourHoursAgo)
          .limit(MAX_UPLOADS_PER_EMAIL_24H);

        if (recentUploads && recentUploads.length >= MAX_UPLOADS_PER_EMAIL_24H) {
          return new Response(
            JSON.stringify({ error: "You've reached the upload limit. Please try again tomorrow." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const extension = getExtension(video.name);
        const fileName = `${crypto.randomUUID()}-${Date.now()}${extension}`;
        let linkedOrderId: string | null = null;

        // Order linking logic
        if (orderId) {
          // Validate order belongs to email
          const { data: order } = await supabase
            .from("orders")
            .select("id, customer_email")
            .eq("id", orderId)
            .maybeSingle();

          if (order && order.customer_email.toLowerCase() === email.toLowerCase()) {
            linkedOrderId = order.id;
          } else {
            console.log(JSON.stringify({
              event: "direct_upload_order_mismatch",
              email, orderId, timestamp: new Date().toISOString(),
            }));
            // Still accept upload, just don't link
          }
        } else {
          // Find delivered orders for this email
          const { data: orders } = await supabase
            .from("orders")
            .select("id")
            .ilike("customer_email", email)
            .eq("status", "delivered")
            .order("delivered_at", { ascending: false })
            .limit(3);

          if (orders && orders.length === 1) {
            linkedOrderId = orders[0].id;
          } else if (orders && orders.length >= 2) {
            console.log(JSON.stringify({
              event: "direct_upload_needs_manual_match",
              email, name, fileName, orderCount: orders.length,
              timestamp: new Date().toISOString(),
            }));
          }
        }

        // Upload to reactions bucket
        const arrayBuffer = await video.arrayBuffer();
        const { error: uploadError } = await supabase.storage
          .from("reactions")
          .upload(fileName, arrayBuffer, {
            contentType: video.type,
            upsert: false,
          });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          return new Response(
            JSON.stringify({ error: "Failed to upload video. Please try again." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: { publicUrl } } = supabase.storage
          .from("reactions")
          .getPublicUrl(fileName);

        // If linked to order, update DB with verified pattern
        if (linkedOrderId) {
          const { data: updatedOrder, error: updateError } = await supabase
            .from("orders")
            .update({
              reaction_video_url: publicUrl,
              reaction_submitted_at: new Date().toISOString(),
            })
            .eq("id", linkedOrderId)
            .select("id, reaction_video_url")
            .single();

          if (updateError || !updatedOrder || !updatedOrder.reaction_video_url) {
            console.error(JSON.stringify({
              event: "direct_upload_db_update_failed",
              linkedOrderId, fileName,
              updateError: updateError?.message || "empty result",
              timestamp: new Date().toISOString(),
            }));

            // Rollback: delete uploaded file
            await supabase.storage.from("reactions").remove([fileName]);

            return new Response(
              JSON.stringify({ error: "Failed to save reaction — please try again" }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          // Log unlinked upload for manual review
          console.log(JSON.stringify({
            event: "direct_upload_unlinked",
            email, name, fileName, publicUrl,
            timestamp: new Date().toISOString(),
          }));
        }

        console.log(JSON.stringify({
          event: "direct_upload_success",
          email, name, fileName, linkedOrderId,
          fileSize: video.size,
          timestamp: new Date().toISOString(),
        }));

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ── existing upload action ──
      if (action === "upload") {
        const orderId = formData.get("orderId") as string;

        if (!email || !orderId || !video) {
          return new Response(
            JSON.stringify({ error: "Email, order ID, and video are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const videoError = validateVideo(video);
        if (videoError) {
          return new Response(
            JSON.stringify({ error: videoError }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Verify the order belongs to this email
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

        if (order.customer_email.toLowerCase() !== email.toLowerCase()) {
          return new Response(
            JSON.stringify({ error: "Email does not match order" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (order.reaction_submitted_at) {
          console.log(`Re-submitting reaction for order ${orderId} (previous: ${order.reaction_submitted_at})`);
        }

        const extension = getExtension(video.name);
        const fileName = `${orderId}-reaction${extension}`;

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

        const { data: { publicUrl } } = supabase.storage
          .from("reactions")
          .getPublicUrl(fileName);

        const { data: updatedOrder, error: updateError } = await supabase
          .from("orders")
          .update({
            reaction_video_url: publicUrl,
            reaction_submitted_at: new Date().toISOString(),
          })
          .eq("id", orderId)
          .select("id, reaction_video_url")
          .single();

        if (updateError || !updatedOrder || !updatedOrder.reaction_video_url) {
          console.error(JSON.stringify({
            event: "reaction_db_update_failed",
            orderId, fileName,
            updateError: updateError?.message || "No error but update returned empty",
            updatedOrder,
            timestamp: new Date().toISOString(),
          }));

          const { error: deleteError } = await supabase.storage
            .from("reactions")
            .remove([fileName]);

          if (deleteError) {
            console.error(JSON.stringify({
              event: "reaction_rollback_failed",
              orderId, fileName,
              deleteError: deleteError.message,
              timestamp: new Date().toISOString(),
            }));
          }

          return new Response(
            JSON.stringify({ error: "Failed to save reaction - please try again" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(JSON.stringify({
          event: "reaction_uploaded",
          orderId, fileName,
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
        JSON.stringify({ error: "Invalid action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
