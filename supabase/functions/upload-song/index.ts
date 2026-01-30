import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import MP3Tag from "https://esm.sh/mp3tag.js@3.11.0";

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

    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf("."));

    // Validate audio file type
    const allowedTypes = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/flac"];
    const allowedExtensions = [".mp3", ".wav", ".m4a", ".ogg", ".flac"];
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      return new Response(
        JSON.stringify({ error: "Invalid file type. Allowed: MP3, WAV, M4A, OGG, FLAC" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create clean filename using order ID
    const shortOrderId = orderId.slice(0, 8).toUpperCase();
    const extension = fileExtension || ".mp3";
    const storagePath = `${shortOrderId}${extension}`;

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Extract song title from original filename (remove extension and clean up)
    const originalFileName = file.name;
    const songTitle = originalFileName
      .replace(/\.[^/.]+$/, "")  // Remove extension
      .replace(/[-_]/g, " ")     // Replace dashes/underscores with spaces
      .replace(/\s+/g, " ")      // Normalize multiple spaces
      .trim();

    // Try to extract cover art from MP3 ID3 tags
    let coverImageUrl: string | null = null;
    
    if (extension === ".mp3") {
      try {
        console.log("Attempting to parse ID3 tags for cover art...");
        const mp3tag = new MP3Tag(arrayBuffer);
        mp3tag.read();
        
        if (!mp3tag.error && mp3tag.tags?.v2?.APIC) {
          // APIC can be an array or single object
          const pictures = Array.isArray(mp3tag.tags.v2.APIC) 
            ? mp3tag.tags.v2.APIC 
            : [mp3tag.tags.v2.APIC];
          
          const picture = pictures[0];
          if (picture && picture.data) {
            console.log("Found embedded cover art, extracting...");
            
            // picture.data is already a Uint8Array or array of bytes
            const coverBytes = picture.data instanceof Uint8Array 
              ? picture.data 
              : new Uint8Array(picture.data);
            
            const format = picture.format || "image/jpeg";
            const ext = format.includes("png") ? "png" : "jpg";
            const coverPath = `${shortOrderId}-cover.${ext}`;
            
            // Upload cover to songs bucket
            const { error: coverUploadError } = await supabase.storage
              .from("songs")
              .upload(coverPath, coverBytes, {
                contentType: format,
                upsert: true,
              });
            
            if (coverUploadError) {
              console.error("Cover upload error:", coverUploadError);
            } else {
              const { data: coverUrlData } = supabase.storage
                .from("songs")
                .getPublicUrl(coverPath);
              coverImageUrl = coverUrlData.publicUrl;
              console.log("Cover art uploaded:", coverImageUrl);
            }
          }
        } else {
          console.log("No APIC frame found or parse error:", mp3tag.error);
        }
      } catch (e) {
        console.log("ID3 parsing skipped:", e);
      }
    }

    // Upload audio to storage (upsert to allow replacing existing files)
    const { error: uploadError } = await supabase.storage
      .from("songs")
      .upload(storagePath, uint8Array, {
        contentType: file.type || "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Get public URL for the song
    const { data: urlData } = supabase.storage
      .from("songs")
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // Update the order with song URL, title, and cover (if extracted)
    const updateData: Record<string, string | null> = {
      song_url: publicUrl,
      song_title: songTitle,
    };
    
    // Only update cover_image_url if we extracted one
    if (coverImageUrl) {
      updateData.cover_image_url = coverImageUrl;
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", orderId);

    if (updateError) {
      console.error("Order update error:", updateError);
      // Don't fail - the file is uploaded, just couldn't update order
    }

    console.log(`Song uploaded for order ${shortOrderId}: ${publicUrl}`);
    console.log(`Title set to: "${songTitle}"`);
    if (coverImageUrl) {
      console.log(`Cover art extracted: ${coverImageUrl}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        url: publicUrl,
        orderId: orderId,
        fileName: storagePath,
        songTitle: songTitle,
        coverImageUrl: coverImageUrl,
        type: "song"
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
