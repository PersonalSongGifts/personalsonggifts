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
      throw new Error("KIE_API_KEY not configured");
    }

    const payload = await req.json();
    console.log("Suno callback received:", JSON.stringify(payload).substring(0, 500));

    // Extract task ID from callback
    const taskId = payload?.data?.taskId || payload?.data?.task_id || payload?.taskId;
    if (!taskId) {
      console.error("No taskId in callback payload");
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
      console.error("Lead not found for taskId:", taskId);
      return new Response("Lead not found", { status: 404, headers: corsHeaders });
    }

    // Security: Check if manual override was set (admin took over)
    if (lead.automation_manual_override_at) {
      console.log(`Manual override active for lead ${lead.id}, ignoring callback`);
      return new Response("Manual override active", { status: 200, headers: corsHeaders });
    }

    // Security: Verify status is in expected state
    if (lead.automation_status !== "audio_generating") {
      console.log(`Unexpected status ${lead.automation_status} for lead ${lead.id}`);
      return new Response("Unexpected status", { status: 200, headers: corsHeaders });
    }

    // Fetch canonical status from Kie.ai (don't trust callback payload alone)
    const statusUrl = `https://api.kie.ai/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`;
    const statusResponse = await fetch(statusUrl, {
      headers: { "Authorization": `Bearer ${KIE_API_KEY}` },
    });

    if (!statusResponse.ok) {
      console.error("Status fetch failed:", statusResponse.status);
      return new Response("Status fetch failed", { status: 500, headers: corsHeaders });
    }

    const statusData = await statusResponse.json();
    console.log("Suno status:", JSON.stringify(statusData).substring(0, 500));

    if (statusData?.code !== 200) {
      console.error("Invalid status response:", statusData);
      return new Response("Invalid status", { status: 500, headers: corsHeaders });
    }

    const task = statusData.data;
    
    // Check if task is complete
    if (!["SUCCESS", "FIRST_SUCCESS"].includes(task?.status)) {
      console.log(`Task ${taskId} not complete yet: ${task?.status}`);
      return new Response("Task not complete", { status: 200, headers: corsHeaders });
    }

    // Get audio data (first song - auto-pick)
    const sunoData = task?.response?.sunoData;
    if (!sunoData || !Array.isArray(sunoData) || sunoData.length === 0) {
      console.error("No audio data in task response");
      
      await supabase
        .from("leads")
        .update({
          automation_status: "failed",
          automation_last_error: "No audio data returned from Suno",
          automation_retry_count: (lead.automation_retry_count || 0) + 1,
        })
        .eq("id", lead.id);

      return new Response("No audio data", { status: 200, headers: corsHeaders });
    }

    // Pick first song (auto-pick strategy)
    const song = sunoData[0];
    const audioUrl = song.audioUrl || song.audio_url;
    const coverUrl = song.imageUrl || song.image_url;
    const title = song.title || lead.song_title || `Song for ${lead.recipient_name}`;

    if (!audioUrl) {
      console.error("No audio URL in song data");
      
      await supabase
        .from("leads")
        .update({
          automation_status: "failed",
          automation_last_error: "No audio URL in Suno response",
          automation_retry_count: (lead.automation_retry_count || 0) + 1,
        })
        .eq("id", lead.id);

      return new Response("No audio URL", { status: 200, headers: corsHeaders });
    }

    // Download audio file (with timeout and size limits)
    console.log(`Downloading audio from: ${audioUrl}`);
    const audioResponse = await fetch(audioUrl, {
      signal: AbortSignal.timeout(60000), // 60 second timeout
    });

    if (!audioResponse.ok) {
      throw new Error(`Audio download failed: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuffer);
    
    // Validate file size (max 50MB)
    if (audioBytes.length > 50 * 1024 * 1024) {
      throw new Error("Audio file too large");
    }

    console.log(`Downloaded ${audioBytes.length} bytes`);

    // Deterministic storage path for idempotency
    const shortId = lead.id.slice(0, 8).toUpperCase();
    const fullStoragePath = `leads/${shortId}-full.mp3`;
    const previewStoragePath = `leads/${shortId}-preview.mp3`;

    // Upload full song
    const { error: fullUploadError } = await supabase.storage
      .from("songs")
      .upload(fullStoragePath, audioBytes, {
        contentType: "audio/mpeg",
        upsert: true, // Idempotent: overwrites on retry
      });

    if (fullUploadError) {
      console.error("Full song upload error:", fullUploadError);
      throw new Error(`Upload failed: ${fullUploadError.message}`);
    }

    // Create and upload preview
    const previewBytes = createPreviewClip(audioBytes, 45);
    const { error: previewUploadError } = await supabase.storage
      .from("songs")
      .upload(previewStoragePath, previewBytes, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (previewUploadError) {
      console.error("Preview upload error:", previewUploadError);
      // Continue even if preview fails
    }

    // Get public URLs
    const { data: fullUrlData } = supabase.storage
      .from("songs")
      .getPublicUrl(fullStoragePath);
    
    const { data: previewUrlData } = supabase.storage
      .from("songs")
      .getPublicUrl(previewStoragePath);

    // Try to extract cover art from MP3 or use Suno's cover
    let coverImageUrl = coverUrl || null;
    
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
            const coverPath = `${shortId}-cover.${ext}`;
            
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
            }
          }
        }
      } catch (e) {
        console.log("Cover art extraction skipped:", e);
      }
    }

    // Generate preview token
    const previewToken = generatePreviewToken();

    // Calculate auto-send time (24 hours from lead capture)
    const capturedAt = new Date(lead.captured_at);
    const autoSendTime = new Date(capturedAt.getTime() + 24 * 60 * 60 * 1000).toISOString();

    // Update lead with all song data
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
      })
      .eq("id", lead.id);

    console.log(`Automation complete for lead ${lead.id}: ${title}`);
    console.log(`Full: ${fullUrlData.publicUrl}`);
    console.log(`Preview scheduled for: ${autoSendTime}`);

    return new Response(
      JSON.stringify({ success: true, leadId: lead.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Suno callback error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
