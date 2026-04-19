import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import MP3Tag from "npm:mp3tag.js@3.11.0";
import { logActivity } from "../_shared/activity-log.ts";

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

// Calculate expected frame size for validation
function calculateMp3FrameSize(bitrate: number, sampleRate: number, padding: boolean, isMpeg1: boolean): number {
  const samplesPerFrame = isMpeg1 ? 1152 : 576;
  return Math.floor((samplesPerFrame * bitrate * 1000 / 8) / sampleRate) + (padding ? 1 : 0);
}

// Sample rate lookup tables
const MPEG1_SAMPLE_RATES = [44100, 48000, 32000, 0];
const MPEG2_SAMPLE_RATES = [22050, 24000, 16000, 0];

// Detect MP3 bitrate by parsing frame headers with validation
function detectMp3Bitrate(buffer: Uint8Array): number {
  // Search first 8KB for MP3 frame sync (skip potential ID3 tags)
  const searchLimit = Math.min(buffer.length - 4, 8192);
  
  // Collect multiple valid frame detections for consensus
  const detectedBitrates: number[] = [];
  
  for (let i = 0; i < searchLimit && detectedBitrates.length < 5; i++) {
    // Look for frame sync: 0xFF followed by 0xE* or 0xF* (11 bits set)
    if (buffer[i] === 0xFF && (buffer[i + 1] & 0xE0) === 0xE0) {
      const b1 = buffer[i + 1];
      const b2 = buffer[i + 2];
      const b3 = buffer[i + 3];
      
      // Extract header fields
      const versionBits = (b1 >> 3) & 0x03;
      const layerBits = (b1 >> 1) & 0x03;
      const bitrateIndex = (b2 >> 4) & 0x0F;
      const sampleRateIndex = (b2 >> 2) & 0x03;
      const padding = ((b2 >> 1) & 0x01) === 1;
      
      // Validate: Layer III (01), valid bitrate index, valid sample rate
      if (layerBits !== 0x01 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
        continue;
      }
      
      const isMpeg1 = versionBits === 0x03;
      const bitrates = isMpeg1 ? MPEG1_L3_BITRATES : MPEG2_L3_BITRATES;
      const sampleRates = isMpeg1 ? MPEG1_SAMPLE_RATES : MPEG2_SAMPLE_RATES;
      const detectedBitrate = bitrates[bitrateIndex];
      const sampleRate = sampleRates[sampleRateIndex];
      
      if (detectedBitrate > 0 && sampleRate > 0) {
        // Calculate expected frame size and validate next frame exists
        const frameSize = calculateMp3FrameSize(detectedBitrate, sampleRate, padding, isMpeg1);
        const nextFramePos = i + frameSize;
        
        // Validate by checking if next frame also has sync word
        if (nextFramePos + 2 < buffer.length) {
          if (buffer[nextFramePos] === 0xFF && (buffer[nextFramePos + 1] & 0xE0) === 0xE0) {
            detectedBitrates.push(detectedBitrate);
            console.log(`[CALLBACK] Valid frame at ${i}: ${detectedBitrate}kbps, ${sampleRate}Hz, frameSize=${frameSize}`);
            i = nextFramePos - 1; // Skip to next frame
          }
        }
      }
    }
  }
  
  if (detectedBitrates.length > 0) {
    // Use the most common bitrate (handles VBR approximation)
    const bitrateCount = new Map<number, number>();
    detectedBitrates.forEach(br => bitrateCount.set(br, (bitrateCount.get(br) || 0) + 1));
    let maxCount = 0;
    let bestBitrate = 192;
    bitrateCount.forEach((count, br) => {
      if (count > maxCount) {
        maxCount = count;
        bestBitrate = br;
      }
    });
    
    console.log(`[CALLBACK] Detected MP3 bitrate: ${bestBitrate}kbps (from ${detectedBitrates.length} valid frames)`);
    
    // Suno outputs high-quality audio - if detected bitrate is suspiciously low, use file-size estimation
    if (bestBitrate < 128) {
      console.log(`[CALLBACK] Detected bitrate ${bestBitrate}kbps seems too low for Suno, using file-size estimation`);
      // Estimate from file size assuming ~3min song
      const estimatedBitrate = Math.round((buffer.length * 8) / (180 * 1000));
      if (estimatedBitrate >= 128 && estimatedBitrate <= 320) {
        console.log(`[CALLBACK] File-size estimated bitrate: ${estimatedBitrate}kbps`);
        return estimatedBitrate;
      }
      console.log(`[CALLBACK] File-size estimate ${estimatedBitrate}kbps out of range, defaulting to 256kbps`);
      return 256;
    }
    
    return bestBitrate;
  }
  
  // Default to 256kbps for high-quality Suno output (Suno uses high bitrates)
  console.log("[CALLBACK] Could not detect bitrate, defaulting to 256kbps for Suno");
  return 256;
}

// Create a 45-second preview clip with accurate bitrate-based byte calculation
function createPreviewClip(originalBuffer: Uint8Array, durationSeconds: number = 45): Uint8Array {
  const bitrate = detectMp3Bitrate(originalBuffer);
  const bytesPerSecond = (bitrate * 1000) / 8; // Convert kbps to bytes/sec (1000 not 1024!)
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

    // Try to find entity by task ID - check both leads and orders, including bonus_automation_task_id
    let entityInfo: EntityInfo | null = null;
    let isBonusCallback = false;
    
    // Check leads first (primary task)
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("automation_task_id", taskId)
      .maybeSingle();

    if (lead && !leadError) {
      entityInfo = { type: "lead", table: "leads", id: lead.id, entity: lead };
      console.log(`[CALLBACK] Found lead ${lead.id} (${lead.recipient_name}) for primary taskId ${taskId}`);
    } else {
      // Check leads bonus task
      const { data: bonusLead, error: bonusLeadError } = await supabase
        .from("leads")
        .select("*")
        .eq("bonus_automation_task_id", taskId)
        .maybeSingle();
      
      if (bonusLead && !bonusLeadError) {
        entityInfo = { type: "lead", table: "leads", id: bonusLead.id, entity: bonusLead };
        isBonusCallback = true;
        console.log(`[CALLBACK] Found lead ${bonusLead.id} for BONUS taskId ${taskId}`);
      } else {
        // Check orders primary task
        const { data: order, error: orderError } = await supabase
          .from("orders")
          .select("*")
          .eq("automation_task_id", taskId)
          .maybeSingle();

        if (order && !orderError) {
          entityInfo = { type: "order", table: "orders", id: order.id, entity: order };
          console.log(`[CALLBACK] Found order ${order.id} (${order.recipient_name}) for primary taskId ${taskId}`);
        } else {
          // Check orders bonus task
          const { data: bonusOrder, error: bonusOrderError } = await supabase
            .from("orders")
            .select("*")
            .eq("bonus_automation_task_id", taskId)
            .maybeSingle();
          
          if (bonusOrder && !bonusOrderError) {
            entityInfo = { type: "order", table: "orders", id: bonusOrder.id, entity: bonusOrder };
            isBonusCallback = true;
            console.log(`[CALLBACK] Found order ${bonusOrder.id} for BONUS taskId ${taskId}`);
          }
        }
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
    
    if (isBonusCallback) {
      // Bonus-specific guards
      if (entity.bonus_song_url) {
        console.log(`[CALLBACK] Bonus already has song URL for ${entityId}, skipping (idempotent)`);
        return new Response("Bonus already processed", { status: 200, headers: corsHeaders });
      }
      if (entity.bonus_automation_status !== "audio_generating") {
        console.log(`[CALLBACK] Bonus unexpected status ${entity.bonus_automation_status} for ${entityId}`);
        return new Response("Bonus unexpected status", { status: 200, headers: corsHeaders });
      }
      // Stale task guard: reject callbacks from old tasks after manual regen
      if (entity.bonus_automation_task_id && entity.bonus_automation_task_id !== taskId) {
        console.log(`[CALLBACK] Stale bonus callback: expected ${entity.bonus_automation_task_id}, got ${taskId}`);
        return new Response("Stale bonus callback", { status: 200, headers: corsHeaders });
      }
      if (entity.automation_manual_override_at) {
        console.log(`[CALLBACK] Manual override active, ignoring bonus callback`);
        return new Response("Manual override active", { status: 200, headers: corsHeaders });
      }
    } else {
      // Primary-specific guards
      
      // Guard 1: Pending revision — discard stale audio, restart generation
      if (entityType === "order" && entity.pending_revision) {
        console.log(`[CALLBACK] ⚠️ Pending revision for order ${entityId}, discarding stale audio callback`);
        await supabase
          .from("orders")
          .update({
            automation_status: "failed",
            automation_last_error: "[CALLBACK] Discarded: revision pending, stale audio result",
            automation_task_id: null,
          })
          .eq("id", entityId);
        return new Response("Revision pending, discarded", { status: 200, headers: corsHeaders });
      }

      // Guard 2: Already has song URL (skip unless force reprocess)
      const existingSongUrl = entityType === "order" ? entity.song_url : entity.preview_song_url;
      if (existingSongUrl) {
        console.log(`[CALLBACK] Entity ${entityId} already has song URL, skipping (idempotent)`);
        return new Response("Already processed", { status: 200, headers: corsHeaders });
      }

      // Guard 3: Already sent (never overwrite after delivery)
      if (entity.sent_at || entity.preview_sent_at) {
        console.log(`[CALLBACK] Entity ${entityId} already sent, ignoring callback (idempotent)`);
        return new Response("Already sent", { status: 200, headers: corsHeaders });
      }

      // Guard 4: Manual override active (admin took over)
      if (entity.automation_manual_override_at) {
        console.log(`[CALLBACK] Manual override active for ${entityType} ${entityId}, ignoring callback`);
        return new Response("Manual override active", { status: 200, headers: corsHeaders });
      }

      // Guard 5: Verify status is in expected state
      if (entity.automation_status !== "audio_generating") {
        console.log(`[CALLBACK] Unexpected status ${entity.automation_status} for ${entityType} ${entityId}`);
        return new Response("Unexpected status", { status: 200, headers: corsHeaders });
      }
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
            ...((!isBonusCallback && entity.bonus_automation_status === "audio_generating") ? {
              bonus_automation_status: "failed",
              bonus_automation_last_error: "Primary song generation failed",
            } : {}),
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
            ...((!isBonusCallback && entity.bonus_automation_status === "audio_generating") ? {
              bonus_automation_status: "failed",
              bonus_automation_last_error: "Primary song generation failed",
            } : {}),
          })
          .eq("id", entityId);
        return new Response("Audio generation failed", { status: 200, headers: corsHeaders });

      case "SENSITIVE_WORD_ERROR": {
        const newStrikes = ((entity.content_filter_strikes as number) || 0) + 1;
        const MAX_CONTENT_FILTER_STRIKES = 5;
        const hitCap = newStrikes >= MAX_CONTENT_FILTER_STRIKES;

        console.error(`[CALLBACK] Task ${taskId} content filtered (strike ${newStrikes}/${MAX_CONTENT_FILTER_STRIKES}):`, task?.errorMessage);

        // Build update — clear lyrics & task on each strike so next retry generates fresh
        // (softer) lyrics. Hit the cap → permanently_failed + alert.
        const baseUpdate: Record<string, unknown> = {
          content_filter_strikes: newStrikes,
          automation_last_error: `[CALLBACK] Content filtered by Suno (strike ${newStrikes}/${MAX_CONTENT_FILTER_STRIKES}): ${task?.errorMessage || "Sensitive content detected"}`,
          automation_retry_count: ((entity.automation_retry_count as number) || 0) + 1,
          // Wipe the rejected lyrics so the next retry regenerates with the softening prompt
          ...(!hitCap ? { automation_lyrics: null, automation_task_id: null } : {}),
          ...((!isBonusCallback && entity.bonus_automation_status === "audio_generating") ? {
            bonus_automation_status: "failed",
            bonus_automation_last_error: "Primary song generation failed",
          } : {}),
        };

        if (hitCap) {
          baseUpdate.automation_status = "permanently_failed";
        } else {
          // Stay in 'failed' — process-scheduled-deliveries auto-retry will pick it up
          // and call automation-trigger again, which calls generate-lyrics with the
          // softening prompt (since content_filter_strikes > 0).
          baseUpdate.automation_status = "failed";
        }

        await supabase.from(tableName).update(baseUpdate).eq("id", entityId);

        // Log every strike for visibility
        await supabase.from("order_activity_log").insert({
          entity_type: tableName === "orders" ? "order" : "lead",
          entity_id: entityId,
          event_type: hitCap ? "content_filter_alert" : "content_filter_strike",
          actor: "system",
          details: hitCap
            ? `🚨 Suno content filter rejected ${MAX_CONTENT_FILTER_STRIKES} consecutive attempts — needs manual review`
            : `Suno content filter rejected lyrics (strike ${newStrikes}/${MAX_CONTENT_FILTER_STRIKES}). Auto-retry with softer prompt.`,
          metadata: { strikes: newStrikes, suno_message: task?.errorMessage || null },
        });

        return new Response("Content filtered", { status: 200, headers: corsHeaders });
      }

      case "CALLBACK_EXCEPTION":
        console.error(`[CALLBACK] Task ${taskId} callback error:`, task?.errorMessage);
        await supabase
          .from(tableName)
          .update({
            automation_status: "failed",
            automation_last_error: `[CALLBACK] Callback exception: ${task?.errorMessage || "Unknown error"}`,
            automation_retry_count: ((entity.automation_retry_count as number) || 0) + 1,
            ...((!isBonusCallback && entity.bonus_automation_status === "audio_generating") ? {
              bonus_automation_status: "failed",
              bonus_automation_last_error: "Primary song generation failed",
            } : {}),
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
    
    let coverUrl = canonical.coverUrl;
    const title = canonical.title || (entity.song_title as string) || `Song for ${entity.recipient_name}`;
    
    // Collect ALL available audio URLs for retry fallback
    const allAudioUrls: Array<{ url: string; source: string }> = [];
    
    // From canonical extraction
    if (canonical.audioUrl) {
      allAudioUrls.push({ url: canonical.audioUrl, source: canonical.extractedFrom });
    }
    
    // From sunoData - collect ALL URL variants (not just first match)
    if (sunoData && Array.isArray(sunoData) && sunoData.length > 0) {
      const song = sunoData[0];
      const urlFields = [
        { key: 'audioUrl', value: song.audioUrl },
        { key: 'audio_url', value: song.audio_url },
        { key: 'sourceAudioUrl', value: song.sourceAudioUrl },
        { key: 'source_audio_url', value: song.source_audio_url },
        { key: 'streamAudioUrl', value: song.streamAudioUrl },
        { key: 'stream_audio_url', value: song.stream_audio_url },
        { key: 'sourceStreamAudioUrl', value: song.sourceStreamAudioUrl },
        { key: 'source_stream_audio_url', value: song.source_stream_audio_url },
      ];
      
      for (const field of urlFields) {
        if (typeof field.value === 'string' && field.value.length > 0) {
          // Avoid duplicates
          if (!allAudioUrls.some(u => u.url === field.value)) {
            allAudioUrls.push({ url: field.value, source: `sunoData.${field.key}` });
          }
        }
      }
      
      coverUrl = coverUrl || song.imageUrl || song.image_url;
    }

    console.log(`[CALLBACK] Found ${allAudioUrls.length} audio URL(s): ${allAudioUrls.map(u => u.source).join(', ')}`);
    console.log(`[CALLBACK] Final extraction - coverUrl: ${coverUrl ? 'present' : 'missing'}, title: ${title}`);

    if (allAudioUrls.length === 0) {
      console.error("[CALLBACK] No audio URL found after all extraction attempts");
      
      await supabase
        .from(tableName)
        .update({
          automation_status: "failed",
          automation_last_error: `[CALLBACK] No audio URL in Suno response. Raw payload stored for debugging.`,
          automation_retry_count: ((entity.automation_retry_count as number) || 0) + 1,
        })
        .eq("id", entityId);

      return new Response("No audio URL", { status: 200, headers: corsHeaders });
    }

    // Try downloading from each URL until we get a valid file (>10KB)
    let audioBytes: Uint8Array | null = null;
    let usedSource = '';
    
    for (const { url, source } of allAudioUrls) {
      try {
        console.log(`[CALLBACK] Trying download from ${source}: ${url.substring(0, 80)}...`);
        const audioResponse = await fetch(url, {
          signal: AbortSignal.timeout(60000),
        });

        if (!audioResponse.ok) {
          console.warn(`[CALLBACK] Download failed from ${source}: HTTP ${audioResponse.status}`);
          continue;
        }

        const audioBuffer = await audioResponse.arrayBuffer();
        const bytes = new Uint8Array(audioBuffer);
        
        console.log(`[CALLBACK] Downloaded ${bytes.length} bytes from ${source}`);
        
        // Validate minimum size (10KB for a real MP3)
        if (bytes.length < 10000) {
          console.warn(`[CALLBACK] File from ${source} too small (${bytes.length} bytes), trying next URL`);
          continue;
        }
        
        // Validate maximum size (50MB)
        if (bytes.length > 50 * 1024 * 1024) {
          console.warn(`[CALLBACK] File from ${source} too large (${bytes.length} bytes), trying next URL`);
          continue;
        }
        
        audioBytes = bytes;
        usedSource = source;
        break;
      } catch (downloadError) {
        console.warn(`[CALLBACK] Download error from ${source}:`, downloadError);
        continue;
      }
    }
    
    if (!audioBytes) {
      console.error(`[CALLBACK] All ${allAudioUrls.length} audio URL(s) failed to produce a valid file`);
      if (isBonusCallback) {
        await supabase.from(tableName).update({
          bonus_automation_status: "failed",
          bonus_automation_last_error: `All ${allAudioUrls.length} audio URLs returned empty/invalid files.`,
        }).eq("id", entityId);
      } else {
        await supabase.from(tableName).update({
          automation_status: "failed",
          automation_last_error: `[CALLBACK] All ${allAudioUrls.length} audio URLs returned empty/invalid files. URLs tried: ${allAudioUrls.map(u => u.source).join(', ')}. Will retry.`,
          automation_retry_count: ((entity.automation_retry_count as number) || 0) + 1,
        }).eq("id", entityId);
      }
      return new Response("Audio file empty", { status: 200, headers: corsHeaders });
    }
    
    console.log(`[CALLBACK] ✅ Valid audio: ${audioBytes.length} bytes from ${usedSource}`);

    // Duration guard: estimate duration from file size and bitrate (180s minimum)
    const estimatedBitrate = detectMp3Bitrate(audioBytes);
    const estimatedDurationSec = Math.round((audioBytes.length * 8) / (estimatedBitrate * 1000));
    console.log(`[CALLBACK] Estimated duration: ${estimatedDurationSec}s (${estimatedBitrate}kbps, ${audioBytes.length} bytes)`);

    if (estimatedDurationSec < 180) {
      console.log(`[CALLBACK] ⚠️ Song too short (${estimatedDurationSec}s < 180s)`);
      if (isBonusCallback) {
        await supabase.from(tableName).update({
          bonus_automation_status: "failed",
          bonus_automation_last_error: `Bonus song too short (${estimatedDurationSec}s), expected 180s+.`,
        }).eq("id", entityId);
      } else {
        const currentShortRetry = (entity.short_retry_count as number) || 0;
        const MAX_SHORT_RETRIES = 2;

        if (currentShortRetry < MAX_SHORT_RETRIES) {
          console.log(`[CALLBACK] Auto-retrying short song (attempt ${currentShortRetry + 1}/${MAX_SHORT_RETRIES})`);
          await supabase.from(tableName).update({
            automation_status: "failed",
            automation_last_error: `Song too short (${estimatedDurationSec}s), auto-retrying with new lyrics (attempt ${currentShortRetry + 1}/${MAX_SHORT_RETRIES})`,
            short_retry_count: currentShortRetry + 1,
            automation_lyrics: null,
            bonus_automation_status: null,
            bonus_automation_task_id: null,
            bonus_automation_started_at: null,
            bonus_automation_last_error: null,
            bonus_song_url: null,
            bonus_preview_url: null,
            bonus_cover_image_url: null,
            bonus_song_title: null,
            bonus_style_prompt: null,
          }).eq("id", entityId);
          await logActivity(supabase, entityType, entityId, "audio_too_short_retry", "system", `Audio ${estimatedDurationSec}s, auto-retrying with new lyrics (attempt ${currentShortRetry + 1}/${MAX_SHORT_RETRIES})`);
        } else {
          // INVARIANT: Never write needs_review unless we've actually exhausted retries.
          // This guards against a regression of the original bug shape (orders flagged
          // for manual review on the very first short song with short_retry_count=0).
          if (currentShortRetry < MAX_SHORT_RETRIES) {
            console.warn(`[CALLBACK] ⚠️ INVARIANT VIOLATION: about to write needs_review with short_retry_count=${currentShortRetry} < ${MAX_SHORT_RETRIES}. Forcing retry path instead.`);
            await supabase.from(tableName).update({
              automation_status: "failed",
              automation_last_error: `Song too short (${estimatedDurationSec}s), invariant-guarded auto-retry (count=${currentShortRetry + 1}/${MAX_SHORT_RETRIES})`,
              short_retry_count: currentShortRetry + 1,
              automation_lyrics: null,
            }).eq("id", entityId);
            await logActivity(supabase, entityType, entityId, "audio_too_short_retry", "system", `Invariant-guarded retry, count=${currentShortRetry + 1}`);
          } else {
            console.log(`[CALLBACK] Max short retries reached, flagging for manual review`);
            await supabase.from(tableName).update({
              automation_status: "needs_review",
              automation_last_error: `Song too short (${estimatedDurationSec}s) after ${MAX_SHORT_RETRIES} auto-retries. Needs manual review.`,
            }).eq("id", entityId);
            await logActivity(supabase, entityType, entityId, "audio_too_short", "system", `Audio ${estimatedDurationSec}s after ${MAX_SHORT_RETRIES} retries, flagged for review`);
          }
        }
      }

      return new Response(
        JSON.stringify({ success: false, reason: "song_too_short", duration: estimatedDurationSec }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deterministic storage path for idempotency
    const shortId = entityId.slice(0, 8).toUpperCase();
    const folderPrefix = entityType === "order" ? "orders" : "leads";
    const bonusSuffix = isBonusCallback ? "-bonus" : "";
    const fullStoragePath = `${folderPrefix}/${shortId}${bonusSuffix}-full.mp3`;
    const previewStoragePath = `${folderPrefix}/${shortId}${bonusSuffix}-preview.mp3`;

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

    // Create and upload preview (for leads OR bonus callbacks)
    let previewUrlData = null;
    if (entityType === "lead" || isBonusCallback) {
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
        const mp3tag = new MP3Tag(audioBytes.buffer);
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

    // ======= BONUS CALLBACK: Save bonus track data =======
    if (isBonusCallback) {
      console.log(`[CALLBACK] Saving bonus track for ${entityType} ${entityId}`);
      await supabase
        .from(tableName)
        .update({
          bonus_song_url: fullUrlData.publicUrl,
          bonus_preview_url: previewUrlData?.publicUrl || null,
          bonus_song_title: title,
          bonus_cover_image_url: coverImageUrl,
          bonus_automation_status: "completed",
          bonus_automation_last_error: null,
        })
        .eq("id", entityId);

      console.log(`[CALLBACK] ✅ Bonus track saved for ${entityType} ${entityId}`);
      await logActivity(supabase, entityType, entityId, "bonus_audio_generated", "system", `Bonus acoustic track generated, ${audioBytes!.length} bytes`);

      // For orders: check if primary is done, and if so, schedule delivery
      if (entityType === "order") {
        const { data: freshOrder } = await supabase.from("orders").select("song_url, automation_status, delivery_status").eq("id", entityId).single();
        if (freshOrder?.song_url && freshOrder?.automation_status === "completed" && !freshOrder?.delivery_status) {
          console.log(`[CALLBACK] Primary done + bonus done → scheduling delivery for order ${entityId}`);
          await supabase.from("orders").update({ delivery_status: "scheduled" }).eq("id", entityId);
        }
      }

      return new Response(
        JSON.stringify({ success: true, entityType, entityId, title, audioUrl: fullUrlData.publicUrl, bonus: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ======= PRIMARY CALLBACK: Build update object based on entity type =======
    if (entityType === "lead") {
      const previewToken = entity.preview_token || generatePreviewToken();

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
        autoSendTime = new Date(Date.now() + 60 * 1000).toISOString();
        console.log(`[CALLBACK] Admin tester detected (${entity.email}), scheduling preview for ${autoSendTime}`);
      } else {
        const capturedAt = new Date(entity.captured_at as string);
        autoSendTime = new Date(capturedAt.getTime() + 24 * 60 * 60 * 1000).toISOString();
        console.log(`[CALLBACK] Regular lead, scheduling preview for ${autoSendTime}`);
      }

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
          generated_at: new Date().toISOString(),
          automation_audio_url_source: usedSource,
          content_filter_strikes: 0,
        })
        .eq("id", entityId);

      const { data: verifyLead } = await supabase.from("leads").select("preview_song_url, full_song_url").eq("id", entityId).single();
      if (!verifyLead?.preview_song_url && !verifyLead?.full_song_url) {
        console.error(`[CALLBACK] ⚠️ VERIFICATION FAILED: Lead ${entityId} song URLs not persisted!`);
        await supabase.from("leads").update({
          automation_status: "failed",
          automation_last_error: "Post-update verification failed: song URL not persisted",
        }).eq("id", entityId);
        return new Response("Verification failed", { status: 500, headers: corsHeaders });
      }

      console.log(`[CALLBACK] ✅ Automation complete for lead ${entityId} (verified)`);
      await logActivity(supabase, "lead", entityId, "audio_generated", "system", `Audio generated, ${audioBytes!.length} bytes, source: ${usedSource}`, { taskId });

    } else {
      // Order primary callback
      console.log(`[CALLBACK] Updating order ${entityId} with final song data`);
      
      // Check if bonus is still generating — if so, don't schedule delivery yet
      const bonusStillGenerating = entity.bonus_automation_status === "audio_generating";
      const bonusStartedAt = entity.bonus_automation_started_at ? new Date(entity.bonus_automation_started_at as string) : null;
      const bonusStuckTooLong = bonusStartedAt && (Date.now() - bonusStartedAt.getTime() > 30 * 60 * 1000);
      
      // Deliver if: no bonus generating, OR bonus has been stuck >30min
      const shouldScheduleDelivery = !bonusStillGenerating || bonusStuckTooLong;
      
      if (bonusStillGenerating && !bonusStuckTooLong) {
        console.log(`[CALLBACK] Bonus still generating for order ${entityId}, holding delivery`);
      }
      if (bonusStuckTooLong) {
        console.log(`[CALLBACK] Bonus stuck >30min for order ${entityId}, delivering primary anyway`);
        await supabase.from("orders").update({
          bonus_automation_status: "failed",
          bonus_automation_last_error: "Bonus generation exceeded 30-minute failsafe, primary delivered without bonus",
        }).eq("id", entityId);
      }

      await supabase
        .from("orders")
        .update({
          song_url: fullUrlData.publicUrl,
          song_title: title,
          cover_image_url: coverImageUrl,
          status: "ready",
          automation_status: "completed",
          automation_last_error: null,
          generated_at: new Date().toISOString(),
          delivery_status: shouldScheduleDelivery ? "scheduled" : null,
          automation_audio_url_source: usedSource,
        })
        .eq("id", entityId);

      const { data: verifyOrder } = await supabase.from("orders").select("song_url").eq("id", entityId).single();
      if (!verifyOrder?.song_url) {
        console.error(`[CALLBACK] ⚠️ VERIFICATION FAILED: Order ${entityId} song_url not persisted!`);
        await supabase.from("orders").update({
          automation_status: "failed",
          automation_last_error: "Post-update verification failed: song_url not persisted",
        }).eq("id", entityId);
        return new Response("Verification failed", { status: 500, headers: corsHeaders });
      }

      console.log(`[CALLBACK] ✅ Automation complete for order ${entityId} (verified)`);
      await logActivity(supabase, "order", entityId, "audio_generated", "system", `Audio generated, ${audioBytes!.length} bytes, source: ${usedSource}`, { taskId });
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
