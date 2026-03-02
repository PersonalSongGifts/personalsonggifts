import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import MP3Tag from "npm:mp3tag.js@3.11.0";
import { logActivity } from "../_shared/activity-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Generate a random preview token (16 characters)
function generatePreviewToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 16; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// Create a 45-second preview clip from audio buffer
function createPreviewClip(originalBuffer: Uint8Array, durationSeconds: number = 45): Uint8Array {
  // For simplicity, we'll just take the first portion of the file
  // This is a rough approximation - actual audio clipping would require decoding
  // For MP3 files, we estimate ~128kbps = 16KB/s
  const estimatedBytesPerSecond = 16 * 1024;
  const previewBytes = Math.min(
    durationSeconds * estimatedBytesPerSecond,
    originalBuffer.length
  );
  
  // Keep the entire file if it's shorter than the preview duration
  if (previewBytes >= originalBuffer.length * 0.9) {
    return originalBuffer;
  }
  
  // Take the first portion of the audio
  return originalBuffer.slice(0, previewBytes);
}

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

    // Get the file and IDs
    const file = formData.get("file");
    const orderId = formData.get("orderId");
    const leadId = formData.get("leadId");
    const entryType = formData.get("type") as string || (orderId ? "order" : "lead");

    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetId = orderId || leadId;
    if (!targetId || typeof targetId !== "string") {
      return new Response(
        JSON.stringify({ error: "Order ID or Lead ID required" }),
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

    // Create clean filename using ID
    const shortId = targetId.slice(0, 8).toUpperCase();
    const extension = fileExtension || ".mp3";

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
            const bucket = entryType === "lead" ? "songs" : "songs";
            const coverPath = `${shortId}-cover.${ext}`;
            
            // Upload cover to songs bucket
            const { error: coverUploadError } = await supabase.storage
              .from(bucket)
              .upload(coverPath, coverBytes, {
                contentType: format,
                upsert: true,
              });
            
            if (coverUploadError) {
              console.error("Cover upload error:", coverUploadError);
            } else {
              const { data: coverUrlData } = supabase.storage
                .from(bucket)
                .getPublicUrl(coverPath);
              const cacheBuster = Date.now();
              coverImageUrl = `${coverUrlData.publicUrl}?v=${cacheBuster}`;
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

    // Handle ORDER uploads
    if (entryType === "order" || orderId) {
      const storagePath = `${shortId}${extension}`;
      
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

      // Get public URL for the song with cache-busting
      const { data: urlData } = supabase.storage
        .from("songs")
        .getPublicUrl(storagePath);

      const cacheBuster = Date.now();
      const publicUrl = `${urlData.publicUrl}?v=${cacheBuster}`;

      // Verify the uploaded file is accessible via HEAD request
      const verifyUrl = urlData.publicUrl; // Without cache buster for verification
      let verification = {
        status: 0,
        contentType: null as string | null,
        contentLength: 0,
        supportsRanges: false,
      };
      
      try {
        const headResponse = await fetch(verifyUrl, { method: "HEAD" });
        
        const contentType = headResponse.headers.get("content-type");
        const contentLength = headResponse.headers.get("content-length");
        const acceptRanges = headResponse.headers.get("accept-ranges");
        
        verification = {
          status: headResponse.status,
          contentType,
          contentLength: parseInt(contentLength || "0"),
          supportsRanges: acceptRanges === "bytes",
        };
        
        console.log(`Verification: status=${headResponse.status}, type=${contentType}, size=${contentLength}, ranges=${acceptRanges}`);
        
        if (!headResponse.ok) {
          console.error(`Upload verification failed: ${headResponse.status}`);
          throw new Error("Upload verification failed - file not accessible");
        }
        
        // Warn if content type is wrong (but don't fail)
        if (contentType && !contentType.includes("audio/")) {
          console.warn(`Unexpected content type: ${contentType}`);
        }
        
        // Minimum size check (at least 10KB for a real audio file)
        if (contentLength && parseInt(contentLength) < 10000) {
          console.warn(`Unusually small file: ${contentLength} bytes`);
        }
      } catch (verifyError) {
        console.error("Verification check failed:", verifyError);
        // Don't throw - the file might still be accessible, just verification failed
      }

      // Update the order with song URL, title, and cover (if extracted)
      // Also complete automation if it was stuck in an active state
      const updateData: Record<string, unknown> = {
        song_url: publicUrl,
        song_title: songTitle,
        automation_manual_override_at: new Date().toISOString(),
      };
      
      // Only update cover_image_url if we extracted one
      if (coverImageUrl) {
        updateData.cover_image_url = coverImageUrl;
      }

      // Check current automation status to auto-complete stuck automation
      const { data: currentOrder } = await supabase
        .from("orders")
        .select("automation_status, delivery_status, status, automation_lyrics")
        .eq("id", targetId)
        .single();

      const activeStatuses = ["queued", "pending", "lyrics_generating", "lyrics_ready", "audio_generating"];
      if (currentOrder && activeStatuses.includes(currentOrder.automation_status)) {
        updateData.automation_status = "completed";
        updateData.generated_at = new Date().toISOString();
        updateData.automation_audio_url_source = "manual_upload";
        console.log(`[UPLOAD] Auto-completing stuck automation (was: ${currentOrder.automation_status})`);
      }

      // If order hasn't been delivered yet, ensure delivery pipeline can pick it up
      if (currentOrder && !currentOrder.sent_at && currentOrder.delivery_status !== "sent") {
        if (!updateData.automation_status) {
          updateData.automation_status = "completed";
        }
      }

      const { error: updateError } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", targetId);

      if (updateError) {
        console.error("Order update error:", updateError);
        // Don't fail - the file is uploaded, just couldn't update order
      }

      // Auto-generate lyrics if missing (fire-and-forget)
      if (!currentOrder?.automation_lyrics) {
        console.log(`[UPLOAD] No lyrics found for order ${shortId}, triggering generation...`);
        const lyricsUrl = `${supabaseUrl}/functions/v1/automation-generate-lyrics`;
        fetch(lyricsUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ orderId: targetId, type: "order", force: true }),
        })
          .then(r => console.log(`[UPLOAD] Lyrics generation triggered for ${shortId}: ${r.status}`))
          .catch(e => console.error(`[UPLOAD] Lyrics generation failed for ${shortId}:`, e));
      }

      console.log(`Song uploaded for order ${shortId}: ${publicUrl}`);
      console.log(`Title set to: "${songTitle}"`);
      if (coverImageUrl) {
        console.log(`Cover art extracted: ${coverImageUrl}`);
      }

      await logActivity(supabase, "order", targetId, "song_uploaded", "admin", `Manual upload: "${songTitle}", ${uint8Array.length} bytes`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          url: publicUrl,
          orderId: targetId,
          fileName: storagePath,
          songTitle: songTitle,
          coverImageUrl: coverImageUrl,
          type: "order",
          verification
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle LEAD uploads
    const fullStoragePath = `leads/${shortId}-full${extension}`;
    
    // Upload full song
    const { error: fullUploadError } = await supabase.storage
      .from("songs")
      .upload(fullStoragePath, uint8Array, {
        contentType: file.type || "audio/mpeg",
        upsert: true,
      });

    if (fullUploadError) {
      console.error("Full song upload error:", fullUploadError);
      throw new Error(`Upload failed: ${fullUploadError.message}`);
    }

    // Check for client-generated preview file (accurate 45-second clip)
    const previewFile = formData.get("previewFile") as File | null;
    
    let previewStoragePath: string;
    let previewBytes: Uint8Array;
    let previewContentType: string;
    
    if (previewFile && previewFile instanceof File) {
      // Use client-generated preview (accurate timing via Web Audio API)
      console.log("Using client-generated preview file");
      previewBytes = new Uint8Array(await previewFile.arrayBuffer());
      previewContentType = previewFile.type || "audio/wav";
      // Use .wav extension for client-generated previews
      previewStoragePath = `leads/${shortId}-preview.wav`;
    } else {
      // Fallback to byte-slicing (less accurate, for backwards compatibility)
      console.log("Falling back to byte-slicing preview");
      previewBytes = createPreviewClip(uint8Array, 45);
      previewContentType = file.type || "audio/mpeg";
      previewStoragePath = `leads/${shortId}-preview${extension}`;
    }

    // Upload preview
    const { error: previewUploadError } = await supabase.storage
      .from("songs")
      .upload(previewStoragePath, previewBytes, {
        contentType: previewContentType,
        upsert: true,
      });

    if (previewUploadError) {
      console.error("Preview upload error:", previewUploadError);
      // Continue even if preview fails - we have the full song
    }

    // Get public URLs with cache-busting
    const { data: fullUrlData } = supabase.storage
      .from("songs")
      .getPublicUrl(fullStoragePath);
    
    const { data: previewUrlData } = supabase.storage
      .from("songs")
      .getPublicUrl(previewStoragePath);

    const leadCacheBuster = Date.now();
    const fullSongUrl = `${fullUrlData.publicUrl}?v=${leadCacheBuster}`;
    const previewSongUrl = `${previewUrlData.publicUrl}?v=${leadCacheBuster}`;

    // Generate preview token for secure URL
    const previewToken = generatePreviewToken();

    // Calculate auto-send time (24 hours from now)
    const autoSendTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Update the lead with song URLs, title, cover, token, and schedule auto-send
    const leadUpdateData: Record<string, string | null> = {
      full_song_url: fullSongUrl,
      preview_song_url: previewSongUrl,
      song_title: songTitle,
      preview_token: previewToken,
      status: "song_ready",
      preview_scheduled_at: autoSendTime,
    };
    
    if (coverImageUrl) {
      leadUpdateData.cover_image_url = coverImageUrl;
    }

    const { error: leadUpdateError } = await supabase
      .from("leads")
      .update(leadUpdateData)
      .eq("id", targetId);

    if (leadUpdateError) {
      console.error("Lead update error:", leadUpdateError);
    }

    console.log(`Song uploaded for lead ${shortId}`);
    console.log(`Full: ${fullSongUrl}`);
    console.log(`Preview: ${previewSongUrl}`);
    console.log(`Token: ${previewToken}`);

    await logActivity(supabase, "lead", targetId, "song_uploaded", "admin", `Manual upload: "${songTitle}", ${uint8Array.length} bytes`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        fullUrl: fullSongUrl,
        previewUrl: previewSongUrl,
        previewToken: previewToken,
        leadId: targetId,
        songTitle: songTitle,
        coverImageUrl: coverImageUrl,
        type: "lead"
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
