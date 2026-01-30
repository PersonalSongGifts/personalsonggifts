import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const normalizedAdminPassword = adminPassword.trim();

    // Only accept POST requests with multipart form data
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse multipart form data
    const formData = await req.formData();
    
    // Get admin password from form data
    const providedPasswordRaw = formData.get("adminPassword");
    const providedPassword = typeof providedPasswordRaw === "string" ? providedPasswordRaw.trim() : null;

    if (!providedPassword || providedPassword !== normalizedAdminPassword) {
      console.log("Upload auth failed");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the file and order ID
    const file = formData.get("file");
    const orderId = formData.get("orderId");
    const fileType = formData.get("fileType"); // 'song' or 'cover'

    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!orderId || typeof orderId !== "string") {
      return new Response(
        JSON.stringify({ error: "Order ID required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isCoverUpload = fileType === "cover";
    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf("."));

    // Validate file type based on upload type
    if (isCoverUpload) {
      const allowedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      const allowedImageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
      
      if (!allowedImageTypes.includes(file.type) && !allowedImageExtensions.includes(fileExtension)) {
        return new Response(
          JSON.stringify({ error: "Invalid file type. Allowed: JPG, PNG, WEBP, GIF" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      const allowedTypes = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/flac"];
      const allowedExtensions = [".mp3", ".wav", ".m4a", ".ogg", ".flac"];
      
      if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
        return new Response(
          JSON.stringify({ error: "Invalid file type. Allowed: MP3, WAV, M4A, OGG, FLAC" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Create clean filename using order ID
    const shortOrderId = orderId.slice(0, 8).toUpperCase();
    const extension = fileExtension || (isCoverUpload ? ".jpg" : ".mp3");
    const storagePath = isCoverUpload 
      ? `covers/${shortOrderId}${extension}`
      : `${shortOrderId}${extension}`;

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Upload to storage (upsert to allow replacing existing files)
    const { error: uploadError } = await supabase.storage
      .from("songs")
      .upload(storagePath, uint8Array, {
        contentType: file.type || (isCoverUpload ? "image/jpeg" : "audio/mpeg"),
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("songs")
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // Update the order with the new URL
    const updateField = isCoverUpload ? "cover_image_url" : "song_url";
    const { error: updateError } = await supabase
      .from("orders")
      .update({ [updateField]: publicUrl })
      .eq("id", orderId);

    if (updateError) {
      console.error("Order update error:", updateError);
      // Don't fail - the file is uploaded, just couldn't update order
    }

    console.log(`${isCoverUpload ? 'Cover' : 'Song'} uploaded for order ${shortOrderId}: ${publicUrl}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        url: publicUrl,
        orderId: orderId,
        fileName: storagePath,
        type: isCoverUpload ? "cover" : "song"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Upload song error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
