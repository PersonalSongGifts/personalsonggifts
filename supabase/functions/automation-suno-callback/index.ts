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

// ======= CANONICAL CALLBACK NORMALIZATION =======
// Suno returns data in varying formats - this normalizes to a canonical shape
interface CanonicalSunoResponse {
  audioUrl: string | null;
  coverUrl: string | null;
  title: string | null;
  duration: number | null;
  taskId: string | null;
  extractedFrom: string; // For debugging which field was used
}

function normalizeSunoCallback(payload: unknown): CanonicalSunoResponse {
  // Try to extract song data from multiple possible locations
  const p = payload as Record<string, unknown>;
  
  // Handle nested structures - Suno sometimes nests data differently
  const dataObj = p?.data as Record<string, unknown> | undefined;
  const responseObj = dataObj?.response as Record<string, unknown> | undefined;
  
  // Try all known locations for song array
  const songArrayCandidates = [
    responseObj?.sunoData,         // Record-info format
    dataObj?.data,                 // Callback format
    p?.sunoData,                   // Direct format
    dataObj?.sunoData,             // Alternative nesting
  ];
  
  let songData: Record<string, unknown> | null = null;
  for (const candidate of songArrayCandidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      songData = candidate[0] as Record<string, unknown>;
      break;
    }
  }
  
  if (!songData) songData = {};

  // Try ALL known audio URL field variants
  const audioUrlCandidates: Array<{ key: string; value: unknown }> = [
    { key: 'audioUrl', value: songData.audioUrl },
    { key: 'audio_url', value: songData.audio_url },
    { key: 'sourceAudioUrl', value: songData.sourceAudioUrl },
    { key: 'source_audio_url', value: songData.source_audio_url },
    { key: 'streamAudioUrl', value: songData.streamAudioUrl },
    { key: 'stream_audio_url', value: songData.stream_audio_url },
    { key: 'sourceStreamAudioUrl', value: songData.sourceStreamAudioUrl },
    { key: 'source_stream_audio_url', value: songData.source_stream_audio_url },
  ];
  
  let audioUrl: string | null = null;
  let extractedFrom = 'none';
  
  for (const candidate of audioUrlCandidates) {
    if (typeof candidate.value === 'string' && candidate.value.length > 0) {
      audioUrl = candidate.value;
      extractedFrom = candidate.key;
      break;
    }
  }

  // Try ALL known cover URL field variants
  const coverUrl = 
    (songData.imageUrl as string) || (songData.image_url as string) ||
    (songData.sourceImageUrl as string) || (songData.source_image_url as string) ||
    null;

  // Extract taskId from various locations
  const taskId = 
    (dataObj?.task_id as string) || (dataObj?.taskId as string) || 
    (p?.taskId as string) || (p?.task_id as string) || null;

  console.log(`[NORMALIZE] Audio URL extracted from field: ${extractedFrom}`);
  console.log(`[NORMALIZE] Audio candidates checked: ${audioUrlCandidates.map(c => `${c.key}=${c.value ? 'present' : 'empty'}`).join(', ')}`);

  return {
    audioUrl,
    coverUrl,
    title: (songData.title as string) || null,
    duration: (songData.duration as number) || null,
    taskId,
    extractedFrom,
  };
}

// MP3 bitrate lookup tables (MPEG1 Layer 3)
const MPEG1_L3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG2_L3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

// Detect MP3 bitrate by parsing frame header
function detectMp3Bitrate(buffer: Uint8Array): number {
  // Search first 4KB for MP3 frame sync
  const searchLimit = Math.min(buffer.length - 4, 4096);
  
  for (let i = 0; i < searchLimit; i++) {
    // Look for frame sync: 0xFF followed by 0xE* or 0xF* (11 bits set)
    if (buffer[i] === 0xFF && (buffer[i + 1] & 0xE0) === 0xE0) {
      // Parse 4-byte frame header
      const b1 = buffer[i + 1];
      const b2 = buffer[i + 2];
      
      // Extract version (bits 19-20 of header)
      const versionBits = (b1 >> 3) & 0x03;
      // Extract layer (bits 17-18)
      const layerBits = (b1 >> 1) & 0x03;
      // Extract bitrate index (bits 12-15)
      const bitrateIndex = (b2 >> 4) & 0x0F;
      
      // Validate: layer must be Layer III (01), bitrate index must be valid
      if (layerBits !== 0x01 || bitrateIndex === 0 || bitrateIndex === 15) {
        continue;
      }
      
      // MPEG1 = 11, MPEG2 = 10, MPEG2.5 = 00
      const isMpeg1 = versionBits === 0x03;
      const bitrates = isMpeg1 ? MPEG1_L3_BITRATES : MPEG2_L3_BITRATES;
      const detectedBitrate = bitrates[bitrateIndex];
      
      if (detectedBitrate > 0) {
        console.log(`[CALLBACK] Detected MP3 bitrate: ${detectedBitrate}kbps (MPEG${isMpeg1 ? '1' : '2'} Layer III)`);
        return detectedBitrate;
      }
    }
  }
  
  // Default to 192kbps for high-quality Suno output
  console.log("[CALLBACK] Could not detect bitrate, defaulting to 192kbps");
  return 192;
}

// Create a 45-second preview clip with accurate bitrate-based byte calculation
function createPreviewClip(originalBuffer: Uint8Array, durationSeconds: number = 45): Uint8Array {
  const bitrate = detectMp3Bitrate(originalBuffer);
  const bytesPerSecond = (bitrate * 1024) / 8; // Convert kbps to bytes/sec
  const previewBytes = Math.min(
    Math.floor(durationSeconds * bytesPerSecond),
    originalBuffer.length
  );
  
  console.log(`[CALLBACK] Preview clip: ${bitrate}kbps × ${durationSeconds}s = ${previewBytes} bytes (file: ${originalBuffer.length} bytes)`);
  
  // If preview would be 90%+ of file, return full file
  if (previewBytes >= originalBuffer.length * 0.9) {
    console.log("[CALLBACK] Preview would be 90%+ of file, returning full audio");
    return originalBuffer;
  }
  
  return originalBuffer.slice(0, previewBytes);
}

// Entity types
type EntityType = "lead" | "order";

interface EntityInfo {
  type: EntityType;
  table: string;
  id: string;
  entity: Record<string, unknown>;
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

    // Try to find entity by task ID - check both leads and orders
    let entityInfo: EntityInfo | null = null;
    
    // Check leads first
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("automation_task_id", taskId)
      .single();

    if (lead && !leadError) {
      entityInfo = { type: "lead", table: "leads", id: lead.id, entity: lead };
      console.log(`[CALLBACK] Found lead ${lead.id} (${lead.recipient_name}) for taskId ${taskId}`);
    } else {
      // Check orders
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("*")
        .eq("automation_task_id", taskId)
        .single();

      if (order && !orderError) {
        entityInfo = { type: "order", table: "orders", id: order.id, entity: order };
        console.log(`[CALLBACK] Found order ${order.id} (${order.recipient_name}) for taskId ${taskId}`);
      }
    }

    if (!entityInfo) {
      console.error(`[CALLBACK] No entity found for taskId: ${taskId}`);
      return new Response("Entity not found", { status: 404, headers: corsHeaders });
    }

    const { type: entityType, table: tableName, id: entityId, entity } = entityInfo;

    // ======= STORE RAW CALLBACK IMMEDIATELY FOR DEBUGGING =======
    console.log(`[CALLBACK] Storing raw callback payload for ${entityType} ${entityId}`);
    await supabase
      .from(tableName)
      .update({
        automation_raw_callback: payload,
      })
      .eq("id", entityId);

    // ======= IDEMPOTENCY GUARDS =======
    
    // Guard 1: Already has song URL (skip unless force reprocess)
    const existingSongUrl = entityType === "order" ? entity.song_url : entity.preview_song_url;
    if (existingSongUrl) {
      console.log(`[CALLBACK] Entity ${entityId} already has song URL, skipping (idempotent)`);
      return new Response("Already processed", { status: 200, headers: corsHeaders });
    }

    // Guard 2: Already sent (never overwrite after delivery)
    if (entity.sent_at || entity.preview_sent_at) {
      console.log(`[CALLBACK] Entity ${entityId} already sent, ignoring callback (idempotent)`);
      return new Response("Already sent", { status: 200, headers: corsHeaders });
    }

    // Guard 3: Manual override active (admin took over)
    if (entity.automation_manual_override_at) {
      console.log(`[CALLBACK] Manual override active for ${entityType} ${entityId}, ignoring callback`);
      return new Response("Manual override active", { status: 200, headers: corsHeaders });
    }

    // Guard 4: Verify status is in expected state
    if (entity.automation_status !== "audio_generating") {
      console.log(`[CALLBACK] Unexpected status ${entity.automation_status} for ${entityType} ${entityId}`);
      return new Response("Unexpected status", { status: 200, headers: corsHeaders });
    }

    // Try to extract audio data directly from callback payload first (faster)
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
          .from(tableName)
          .update({
            automation_status: "failed",
            automation_last_error: `[CALLBACK] Suno task creation failed: ${task?.errorMessage || "Unknown error"}`,
            automation_retry_count: ((entity.automation_retry_count as number) || 0) + 1,
          })
          .eq("id", entityId);
        return new Response("Task creation failed", { status: 200, headers: corsHeaders });

      case "GENERATE_AUDIO_FAILED":
        console.error(`[CALLBACK] Task ${taskId} audio generation failed:`, task?.errorMessage);
        await supabase
          .from(tableName)
          .update({
            automation_status: "failed",
            automation_last_error: `[CALLBACK] Audio generation failed: ${task?.errorMessage || "Unknown error"}`,
            automation_retry_count: ((entity.automation_retry_count as number) || 0) + 1,
          })
          .eq("id", entityId);
        return new Response("Audio generation failed", { status: 200, headers: corsHeaders });

      case "SENSITIVE_WORD_ERROR":
        console.error(`[CALLBACK] Task ${taskId} content filtered:`, task?.errorMessage);
        await supabase
          .from(tableName)
          .update({
            automation_status: "failed",
            automation_last_error: `[CALLBACK] Content filtered by Suno: ${task?.errorMessage || "Sensitive content detected"}`,
            automation_retry_count: ((entity.automation_retry_count as number) || 0) + 1,
          })
          .eq("id", entityId);
        return new Response("Content filtered", { status: 200, headers: corsHeaders });

      case "CALLBACK_EXCEPTION":
        console.error(`[CALLBACK] Task ${taskId} callback error:`, task?.errorMessage);
        await supabase
          .from(tableName)
          .update({
            automation_status: "failed",
            automation_last_error: `[CALLBACK] Callback exception: ${task?.errorMessage || "Unknown error"}`,
            automation_retry_count: ((entity.automation_retry_count as number) || 0) + 1,
          })
          .eq("id", entityId);
        return new Response("Callback exception", { status: 200, headers: corsHeaders });

      case "SUCCESS":
      case "FIRST_SUCCESS":
        console.log(`[CALLBACK] Task ${taskId} completed successfully with status: ${taskStatus}`);
        break;

      default:
        console.log(`[CALLBACK] Task ${taskId} unknown status: ${taskStatus}`);
        return new Response("Unknown status", { status: 200, headers: corsHeaders });
    }

    // Get audio data - try multiple sources
    let sunoData = task?.response?.sunoData;
    
    if (!sunoData || !Array.isArray(sunoData) || sunoData.length === 0) {
      console.log("[CALLBACK] No sunoData in record-info response, trying callback payload");
      sunoData = audioDataFromCallback || payload?.data?.data;
    }

    console.log(`[CALLBACK] sunoData source found: ${sunoData ? 'yes' : 'no'}, count: ${sunoData?.length || 0}`);

    if (!sunoData || !Array.isArray(sunoData) || sunoData.length === 0) {
      console.error("[CALLBACK] No audio data found in any source");
      
      await supabase
        .from(tableName)
        .update({
          automation_status: "failed",
          automation_last_error: "[CALLBACK] No audio data returned from Suno - check record-info and callback payload formats",
          automation_retry_count: ((entity.automation_retry_count as number) || 0) + 1,
        })
        .eq("id", entityId);

      return new Response("No audio data", { status: 200, headers: corsHeaders });
    }

    // ======= USE CANONICAL NORMALIZATION FOR ALL AUDIO DATA =======
    const canonical = normalizeSunoCallback(statusData);
    console.log(`[CALLBACK] Canonical extraction: audioUrl=${canonical.audioUrl ? 'present' : 'missing'}, from=${canonical.extractedFrom}`);
    
    // If canonical extraction failed, try the legacy fallback
    let audioUrl = canonical.audioUrl;
    let coverUrl = canonical.coverUrl;
    const title = canonical.title || (entity.song_title as string) || `Song for ${entity.recipient_name}`;
    
    // Fallback: try direct from record-info sunoData if canonical failed
    if (!audioUrl && sunoData && Array.isArray(sunoData) && sunoData.length > 0) {
      const song = sunoData[0];
      audioUrl = song.audioUrl || song.audio_url ||
                 song.sourceAudioUrl || song.source_audio_url ||
                 song.streamAudioUrl || song.stream_audio_url ||
                 song.sourceStreamAudioUrl || song.source_stream_audio_url;
      coverUrl = coverUrl || song.imageUrl || song.image_url;
      console.log(`[CALLBACK] Fallback extraction: audioUrl=${audioUrl ? 'present' : 'missing'}`);
    }

    console.log(`[CALLBACK] Final extraction - audioUrl: ${audioUrl ? 'present' : 'missing'}, coverUrl: ${coverUrl ? 'present' : 'missing'}, title: ${title}`);

    if (!audioUrl) {
      console.error("[CALLBACK] No audio URL found after all extraction attempts");
      console.error(`[CALLBACK] Canonical extractedFrom: ${canonical.extractedFrom}`);
      
      await supabase
        .from(tableName)
        .update({
          automation_status: "failed",
          automation_last_error: `[CALLBACK] No audio URL in Suno response. Extraction tried: ${canonical.extractedFrom}. Raw payload stored for debugging.`,
          automation_retry_count: ((entity.automation_retry_count as number) || 0) + 1,
        })
        .eq("id", entityId);

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
    const shortId = entityId.slice(0, 8).toUpperCase();
    const folderPrefix = entityType === "order" ? "orders" : "leads";
    const fullStoragePath = `${folderPrefix}/${shortId}-full.mp3`;
    const previewStoragePath = `${folderPrefix}/${shortId}-preview.mp3`;

    // Upload full song
    console.log(`[CALLBACK] Uploading full song to: ${fullStoragePath}`);
    const { error: fullUploadError } = await supabase.storage
      .from("songs")
      .upload(fullStoragePath, audioBytes, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (fullUploadError) {
      console.error("[CALLBACK] Full song upload error:", fullUploadError);
      throw new Error(`Upload failed: ${fullUploadError.message}`);
    }

    // Create and upload preview (only for leads)
    let previewUrlData = null;
    if (entityType === "lead") {
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
      } else {
        const { data } = supabase.storage
          .from("songs")
          .getPublicUrl(previewStoragePath);
        previewUrlData = data;
      }
    }

    // Get public URLs
    const { data: fullUrlData } = supabase.storage
      .from("songs")
      .getPublicUrl(fullStoragePath);

    console.log(`[CALLBACK] Storage URLs - Full: ${fullUrlData.publicUrl}`);

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
          const coverPath = `${folderPrefix}/${shortId}-cover.jpg`;
          
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
            const coverPath = `${folderPrefix}/${shortId}-cover.${ext}`;
            
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

    // Build update object based on entity type
    if (entityType === "lead") {
      // Generate preview token for leads
      const previewToken = generatePreviewToken();

      // Check if lead email is in admin tester allowlist for accelerated preview
      let autoSendTime: string;
      const { data: testerEmailsSetting } = await supabase
        .from("admin_settings")
        .select("value")
        .eq("key", "admin_tester_emails")
        .maybeSingle();

      const testerEmails = (testerEmailsSetting?.value || "")
        .split(",")
        .map((e: string) => e.trim().toLowerCase())
        .filter((e: string) => e.length > 0);

      const isAdminTester = testerEmails.includes((entity.email as string).toLowerCase());

      if (isAdminTester) {
        // Admin testers get preview email within ~1 minute
        autoSendTime = new Date(Date.now() + 60 * 1000).toISOString();
        console.log(`[CALLBACK] Admin tester detected (${entity.email}), scheduling preview for ${autoSendTime}`);
      } else {
        // Regular leads: 24 hours from capture for conversion optimization
        const capturedAt = new Date(entity.captured_at as string);
        autoSendTime = new Date(capturedAt.getTime() + 24 * 60 * 60 * 1000).toISOString();
        console.log(`[CALLBACK] Regular lead, scheduling preview for ${autoSendTime}`);
      }

      // Update lead with all song data + generated_at timestamp
      console.log(`[CALLBACK] Updating lead ${entityId} with final song data`);
      await supabase
        .from("leads")
        .update({
          full_song_url: fullUrlData.publicUrl,
          preview_song_url: previewUrlData?.publicUrl || fullUrlData.publicUrl,
          song_title: title,
          cover_image_url: coverImageUrl,
          preview_token: previewToken,
          status: "song_ready",
          preview_scheduled_at: autoSendTime,
          automation_status: "completed",
          automation_last_error: null,
          generated_at: new Date().toISOString(), // Track when generation completed
        })
        .eq("id", entityId);

      console.log(`[CALLBACK] ✅ Automation complete for lead ${entityId}`);
      console.log(`[CALLBACK] Preview scheduled for: ${autoSendTime}`);

    } else {
      // Update order with song data + generated_at timestamp
      console.log(`[CALLBACK] Updating order ${entityId} with final song data`);
      await supabase
        .from("orders")
        .update({
          song_url: fullUrlData.publicUrl,
          song_title: title,
          cover_image_url: coverImageUrl,
          status: "ready", // Mark order as ready for delivery (not completed - that's delivery_status)
          automation_status: "completed",
          automation_last_error: null,
          generated_at: new Date().toISOString(), // Track when generation completed
          delivery_status: "scheduled", // Ready for scheduled delivery
        })
        .eq("id", entityId);

      console.log(`[CALLBACK] ✅ Automation complete for order ${entityId}`);
    }

    console.log(`[CALLBACK] Title: ${title}`);
    console.log(`[CALLBACK] Full URL: ${fullUrlData.publicUrl}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        entityType,
        entityId, 
        title, 
        audioUrl: fullUrlData.publicUrl 
      }),
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
