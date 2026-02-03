import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import MP3Tag from "https://esm.sh/mp3tag.js@3.11.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

// Create a 45-second preview clip from audio buffer (rough byte approximation)
function createPreviewClip(originalBuffer: Uint8Array, durationSeconds: number = 45): Uint8Array {
  const estimatedBytesPerSecond = 16 * 1024; // ~128kbps
  const previewBytes = Math.min(
    durationSeconds * estimatedBytesPerSecond,
    originalBuffer.length
  );
  
  if (previewBytes >= originalBuffer.length * 0.9) {
    return originalBuffer;
  }
  
  return originalBuffer.slice(0, previewBytes);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      console.error("[CALLBACK] KIE_API_KEY not configured");
      throw new Error("KIE_API_KEY not configured");
    }

    const payload = await req.json();
    console.log("[CALLBACK] Received payload:", JSON.stringify(payload).substring(0, 1000));

    // Extract task ID from callback - handle both formats
    // Callback format: payload.data.task_id (snake_case)
    // Alternative: payload.data.taskId or payload.taskId
    const taskId = payload?.data?.task_id || payload?.data?.taskId || payload?.taskId;
    const callbackType = payload?.data?.callbackType || "unknown";
    
    console.log(`[CALLBACK] TaskId: ${taskId}, callbackType: ${callbackType}`);
    
    if (!taskId) {
      console.error("[CALLBACK] No taskId in callback payload:", JSON.stringify(payload));
      return new Response("Missing taskId", { status: 400, headers: corsHeaders });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find lead by task ID (security: validates the task exists in our DB)
    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("*")
      .eq("automation_task_id", taskId)
      .single();

    if (fetchError || !lead) {
      console.error(`[CALLBACK] Lead not found for taskId: ${taskId}`, fetchError);
      return new Response("Lead not found", { status: 404, headers: corsHeaders });
    }

    console.log(`[CALLBACK] Found lead ${lead.id} (${lead.recipient_name}) for taskId ${taskId}`);

    // Security: Check if manual override was set (admin took over)
    if (lead.automation_manual_override_at) {
      console.log(`[CALLBACK] Manual override active for lead ${lead.id}, ignoring callback`);
      return new Response("Manual override active", { status: 200, headers: corsHeaders });
    }

    // Security: Verify status is in expected state
    if (lead.automation_status !== "audio_generating") {
      console.log(`[CALLBACK] Unexpected status ${lead.automation_status} for lead ${lead.id}, current: ${lead.automation_status}`);
      return new Response("Unexpected status", { status: 200, headers: corsHeaders });
    }

    // Try to extract audio data directly from callback payload first (faster)
    // Callback format: payload.data.data[0].audio_url (snake_case)
    const callbackAudioData = payload?.data?.data;
    let audioDataFromCallback = null;
    
    if (Array.isArray(callbackAudioData) && callbackAudioData.length > 0 && callbackAudioData[0]?.audio_url) {
      console.log(`[CALLBACK] Found audio data directly in callback payload`);
      audioDataFromCallback = callbackAudioData;
    }

    // Fetch canonical status from Kie.ai to verify and get complete data
    console.log(`[CALLBACK] Fetching record-info for taskId: ${taskId}`);
    const statusUrl = `https://api.kie.ai/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`;
    const statusResponse = await fetch(statusUrl, {
      headers: { "Authorization": `Bearer ${KIE_API_KEY}` },
    });

    if (!statusResponse.ok) {
      console.error(`[CALLBACK] Status fetch failed: ${statusResponse.status}`);
      return new Response("Status fetch failed", { status: 500, headers: corsHeaders });
    }

    const statusData = await statusResponse.json();
    console.log("[CALLBACK] Record-info response:", JSON.stringify(statusData).substring(0, 1000));

    if (statusData?.code !== 200) {
      console.error("[CALLBACK] Invalid status response code:", statusData?.code, statusData?.msg);
      return new Response("Invalid status", { status: 500, headers: corsHeaders });
    }

    const task = statusData.data;
    const taskStatus = task?.status;
    
    console.log(`[CALLBACK] Task status: ${taskStatus}`);

    // Handle all Suno status codes per documentation
    switch (taskStatus) {
      case "PENDING":
        console.log(`[CALLBACK] Task ${taskId} still pending, will receive another callback`);
        return new Response("Task pending", { status: 200, headers: corsHeaders });

      case "CREATE_TASK_FAILED":
        console.error(`[CALLBACK] Task ${taskId} creation failed:`, task?.errorMessage);
        await supabase
          .from("leads")
          .update({
            automation_status: "failed",
            automation_last_error: `[CALLBACK] Suno task creation failed: ${task?.errorMessage || "Unknown error"}`,
            automation_retry_count: (lead.automation_retry_count || 0) + 1,
          })
          .eq("id", lead.id);
        return new Response("Task creation failed", { status: 200, headers: corsHeaders });

      case "GENERATE_AUDIO_FAILED":
        console.error(`[CALLBACK] Task ${taskId} audio generation failed:`, task?.errorMessage);
        await supabase
          .from("leads")
          .update({
            automation_status: "failed",
            automation_last_error: `[CALLBACK] Audio generation failed: ${task?.errorMessage || "Unknown error"}`,
            automation_retry_count: (lead.automation_retry_count || 0) + 1,
          })
          .eq("id", lead.id);
        return new Response("Audio generation failed", { status: 200, headers: corsHeaders });

      case "SENSITIVE_WORD_ERROR":
        console.error(`[CALLBACK] Task ${taskId} content filtered:`, task?.errorMessage);
        await supabase
          .from("leads")
          .update({
            automation_status: "failed",
            automation_last_error: `[CALLBACK] Content filtered by Suno: ${task?.errorMessage || "Sensitive content detected"}`,
            automation_retry_count: (lead.automation_retry_count || 0) + 1,
          })
          .eq("id", lead.id);
        return new Response("Content filtered", { status: 200, headers: corsHeaders });

      case "CALLBACK_EXCEPTION":
        console.error(`[CALLBACK] Task ${taskId} callback error:`, task?.errorMessage);
        await supabase
          .from("leads")
          .update({
            automation_status: "failed",
            automation_last_error: `[CALLBACK] Callback exception: ${task?.errorMessage || "Unknown error"}`,
            automation_retry_count: (lead.automation_retry_count || 0) + 1,
          })
          .eq("id", lead.id);
        return new Response("Callback exception", { status: 200, headers: corsHeaders });

      case "SUCCESS":
      case "FIRST_SUCCESS":
        console.log(`[CALLBACK] Task ${taskId} completed successfully with status: ${taskStatus}`);
        break;

      default:
        console.log(`[CALLBACK] Task ${taskId} unknown status: ${taskStatus}`);
        return new Response("Unknown status", { status: 200, headers: corsHeaders });
    }

    // Get audio data - try multiple sources:
    // 1. record-info response: task.response.sunoData (camelCase)
    // 2. Callback payload: payload.data.data (snake_case for URLs)
    let sunoData = task?.response?.sunoData;
    
    // Fallback to callback payload if record-info doesn't have it
    if (!sunoData || !Array.isArray(sunoData) || sunoData.length === 0) {
      console.log("[CALLBACK] No sunoData in record-info response, trying callback payload");
      sunoData = audioDataFromCallback || payload?.data?.data;
    }

    console.log(`[CALLBACK] sunoData source found: ${sunoData ? 'yes' : 'no'}, count: ${sunoData?.length || 0}`);

    if (!sunoData || !Array.isArray(sunoData) || sunoData.length === 0) {
      console.error("[CALLBACK] No audio data found in any source");
      console.error("[CALLBACK] task.response:", JSON.stringify(task?.response));
      console.error("[CALLBACK] payload.data:", JSON.stringify(payload?.data));
      
      await supabase
        .from("leads")
        .update({
          automation_status: "failed",
          automation_last_error: "[CALLBACK] No audio data returned from Suno - check record-info and callback payload formats",
          automation_retry_count: (lead.automation_retry_count || 0) + 1,
        })
        .eq("id", lead.id);

      return new Response("No audio data", { status: 200, headers: corsHeaders });
    }

    // Pick first song (auto-pick strategy)
    const song = sunoData[0];
    console.log("[CALLBACK] First song data:", JSON.stringify(song).substring(0, 500));
    
    // Handle both camelCase (record-info) and snake_case (callback) field names
    const audioUrl = song.audioUrl || song.audio_url;
    const coverUrl = song.imageUrl || song.image_url;
    const title = song.title || lead.song_title || `Song for ${lead.recipient_name}`;

    console.log(`[CALLBACK] Extracted - audioUrl: ${audioUrl ? 'present' : 'missing'}, coverUrl: ${coverUrl ? 'present' : 'missing'}, title: ${title}`);

    if (!audioUrl) {
      console.error("[CALLBACK] No audio URL found in song data");
      console.error("[CALLBACK] song keys:", Object.keys(song || {}));
      
      await supabase
        .from("leads")
        .update({
          automation_status: "failed",
          automation_last_error: `[CALLBACK] No audio URL in Suno response. Keys: ${Object.keys(song || {}).join(', ')}`,
          automation_retry_count: (lead.automation_retry_count || 0) + 1,
        })
        .eq("id", lead.id);

      return new Response("No audio URL", { status: 200, headers: corsHeaders });
    }

    // Download audio file (with timeout and size limits)
    console.log(`[CALLBACK] Downloading audio from: ${audioUrl}`);
    const audioResponse = await fetch(audioUrl, {
      signal: AbortSignal.timeout(60000), // 60 second timeout
    });

    if (!audioResponse.ok) {
      console.error(`[CALLBACK] Audio download failed: ${audioResponse.status}`);
      throw new Error(`Audio download failed: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuffer);
    
    // Validate file size (max 50MB)
    if (audioBytes.length > 50 * 1024 * 1024) {
      throw new Error("Audio file too large");
    }

    console.log(`[CALLBACK] Downloaded ${audioBytes.length} bytes`);

    // Deterministic storage path for idempotency
    const shortId = lead.id.slice(0, 8).toUpperCase();
    const fullStoragePath = `leads/${shortId}-full.mp3`;
    const previewStoragePath = `leads/${shortId}-preview.mp3`;

    // Upload full song
    console.log(`[CALLBACK] Uploading full song to: ${fullStoragePath}`);
    const { error: fullUploadError } = await supabase.storage
      .from("songs")
      .upload(fullStoragePath, audioBytes, {
        contentType: "audio/mpeg",
        upsert: true, // Idempotent: overwrites on retry
      });

    if (fullUploadError) {
      console.error("[CALLBACK] Full song upload error:", fullUploadError);
      throw new Error(`Upload failed: ${fullUploadError.message}`);
    }

    // Create and upload preview
    console.log(`[CALLBACK] Creating and uploading preview to: ${previewStoragePath}`);
    const previewBytes = createPreviewClip(audioBytes, 45);
    const { error: previewUploadError } = await supabase.storage
      .from("songs")
      .upload(previewStoragePath, previewBytes, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (previewUploadError) {
      console.error("[CALLBACK] Preview upload error:", previewUploadError);
      // Continue even if preview fails
    }

    // Get public URLs
    const { data: fullUrlData } = supabase.storage
      .from("songs")
      .getPublicUrl(fullStoragePath);
    
    const { data: previewUrlData } = supabase.storage
      .from("songs")
      .getPublicUrl(previewStoragePath);

    console.log(`[CALLBACK] Storage URLs - Full: ${fullUrlData.publicUrl}, Preview: ${previewUrlData.publicUrl}`);

    // Try to download Suno's cover image if available
    let coverImageUrl = null;
    if (coverUrl) {
      try {
        console.log(`[CALLBACK] Downloading cover image from: ${coverUrl}`);
        const coverResponse = await fetch(coverUrl, {
          signal: AbortSignal.timeout(30000),
        });
        
        if (coverResponse.ok) {
          const coverBuffer = await coverResponse.arrayBuffer();
          const coverBytes = new Uint8Array(coverBuffer);
          const coverPath = `leads/${shortId}-cover.jpg`;
          
          const { error: coverUploadError } = await supabase.storage
            .from("songs")
            .upload(coverPath, coverBytes, {
              contentType: "image/jpeg",
              upsert: true,
            });
          
          if (!coverUploadError) {
            const { data: coverUrlData } = supabase.storage
              .from("songs")
              .getPublicUrl(coverPath);
            coverImageUrl = coverUrlData.publicUrl;
            console.log(`[CALLBACK] Cover image saved: ${coverImageUrl}`);
          }
        }
      } catch (e) {
        console.log("[CALLBACK] Cover image download/upload skipped:", e);
      }
    }
    
    // Fallback: try to extract cover art from MP3
    if (!coverImageUrl) {
      try {
        const mp3tag = new MP3Tag(audioBuffer);
        mp3tag.read();
        
        if (!mp3tag.error && mp3tag.tags?.v2?.APIC) {
          const pictures = Array.isArray(mp3tag.tags.v2.APIC) 
            ? mp3tag.tags.v2.APIC 
            : [mp3tag.tags.v2.APIC];
          
          const picture = pictures[0];
          if (picture && picture.data) {
            const coverBytes = picture.data instanceof Uint8Array 
              ? picture.data 
              : new Uint8Array(picture.data);
            
            const format = picture.format || "image/jpeg";
            const ext = format.includes("png") ? "png" : "jpg";
            const coverPath = `leads/${shortId}-cover.${ext}`;
            
            const { error: coverUploadError } = await supabase.storage
              .from("songs")
              .upload(coverPath, coverBytes, {
                contentType: format,
                upsert: true,
              });
            
            if (!coverUploadError) {
              const { data: coverUrlData } = supabase.storage
                .from("songs")
                .getPublicUrl(coverPath);
              coverImageUrl = coverUrlData.publicUrl;
              console.log(`[CALLBACK] Cover extracted from MP3: ${coverImageUrl}`);
            }
          }
        }
      } catch (e) {
        console.log("[CALLBACK] MP3 cover art extraction skipped:", e);
      }
    }

    // Generate preview token
    const previewToken = generatePreviewToken();

    // Calculate auto-send time (24 hours from lead capture)
    const capturedAt = new Date(lead.captured_at);
    const autoSendTime = new Date(capturedAt.getTime() + 24 * 60 * 60 * 1000).toISOString();

    // Update lead with all song data
    console.log(`[CALLBACK] Updating lead ${lead.id} with final song data`);
    await supabase
      .from("leads")
      .update({
        full_song_url: fullUrlData.publicUrl,
        preview_song_url: previewUrlData.publicUrl,
        song_title: title,
        cover_image_url: coverImageUrl,
        preview_token: previewToken,
        status: "song_ready",
        preview_scheduled_at: autoSendTime,
        automation_status: "completed",
        automation_last_error: null, // Clear any previous errors
      })
      .eq("id", lead.id);

    console.log(`[CALLBACK] ✅ Automation complete for lead ${lead.id}`);
    console.log(`[CALLBACK] Title: ${title}`);
    console.log(`[CALLBACK] Full URL: ${fullUrlData.publicUrl}`);
    console.log(`[CALLBACK] Preview scheduled for: ${autoSendTime}`);

    return new Response(
      JSON.stringify({ success: true, leadId: lead.id, title, audioUrl: fullUrlData.publicUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[CALLBACK] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
