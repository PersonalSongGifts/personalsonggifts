

# Kie.ai Automation Pipeline Verification & Implementation Plan

## Current State Analysis

After thoroughly exploring the existing implementation, here's what's already in place:

### Existing Edge Functions

| Function | Purpose | Status |
|----------|---------|--------|
| `automation-trigger` | Orchestrates lyrics → audio pipeline | ✅ Exists |
| `automation-generate-lyrics` | Calls Gemini via Kie.ai for lyrics | ✅ Exists |
| `automation-generate-audio` | Calls Suno via Kie.ai for audio | ✅ Exists |
| `automation-suno-callback` | Receives Suno completion callbacks | ✅ Exists |

### Secrets Verification

| Secret | Status | Used By |
|--------|--------|---------|
| `KIE_API_KEY` | ✅ Configured | All automation functions |
| `SUPABASE_URL` | ✅ Configured | Callback URL construction |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Configured | Database operations |

---

## Issues Identified

### Issue 1: Callback Handler Field Name Mismatch

**Current code** in `automation-suno-callback/index.ts` (line 49):
```javascript
const taskId = payload?.data?.taskId || payload?.data?.task_id || payload?.taskId;
```

**According to Kie.ai docs**, the callback payload format is:
```json
{
  "code": 200,
  "data": {
    "callbackType": "complete",
    "task_id": "2fac****9f72",   // ← Note: snake_case
    "data": [{ "audio_url": "...", "image_url": "..." }]
  }
}
```

The current code handles this correctly with the fallback, but the **audio/image URL extraction** (lines 191-192) uses:
```javascript
const audioUrl = song.audioUrl || song.audio_url;
const coverUrl = song.imageUrl || song.image_url;
```

Per the docs, it should be `audio_url` and `image_url` (snake_case). This is already handled but the primary access uses camelCase which won't match.

### Issue 2: Callback is Reading from `response.sunoData` - Wrong Path

**Current code** (line 173):
```javascript
const sunoData = task?.response?.sunoData;
```

**But the record-info response** and **callback payload** both use:
```json
{
  "data": {
    "data": [{ ... }]  // ← nested data.data, not response.sunoData
  }
}
```

This is the **main blocker** - the audio data extraction path is incorrect.

### Issue 3: Missing Detailed Logging

The current functions have minimal logging. Adding step-by-step logging will help diagnose issues.

### Issue 4: Gemini Endpoint Verification

Current code uses:
```javascript
fetch("https://api.kie.ai/gemini-3-pro/v1/chat/completions", ...)
```

Based on Kie.ai's market page and OpenAI-compatible format, this endpoint structure appears correct, but we should verify the response handling.

---

## Implementation Plan

### Step 1: Fix Callback Handler Audio Extraction

Update `automation-suno-callback/index.ts` to correctly extract audio data from the callback payload:

**Change the extraction logic from:**
```javascript
const sunoData = task?.response?.sunoData;
```

**To:**
```javascript
// First try record-info response format
let sunoData = task?.response?.sunoData;

// Fallback to callback payload format (data.data array)
if (!sunoData || !Array.isArray(sunoData) || sunoData.length === 0) {
  sunoData = task?.data || payload?.data?.data;
}
```

### Step 2: Add Comprehensive Logging

Add structured logging at each step:

```text
┌─────────────────────────────────────────────────────────┐
│ GEMINI REQUEST                                          │
│ ├─ Started: Lead {id}, prompt length: {n} chars         │
│ ├─ Completed: {status}, title: {title}                  │
│ └─ Error: {error message if failed}                     │
├─────────────────────────────────────────────────────────┤
│ SUNO REQUEST                                            │
│ ├─ Started: Lead {id}, style: {style}                   │
│ ├─ TaskId: {taskId} saved                               │
│ └─ Error: {error message if failed}                     │
├─────────────────────────────────────────────────────────┤
│ CALLBACK RECEIVED                                       │
│ ├─ TaskId: {taskId}, callbackType: {type}               │
│ ├─ Record-info fetched: status {status}                 │
│ ├─ Audio URL: {url}                                     │
│ └─ Lead {id} updated to: {final_status}                 │
└─────────────────────────────────────────────────────────┘
```

### Step 3: Update Callback to Handle Direct Callback Data

When the callback arrives, we can optionally use the data directly from the callback payload instead of always fetching record-info (which adds latency):

```javascript
// Check if callback itself contains the audio data
const callbackAudio = payload?.data?.data;
if (Array.isArray(callbackAudio) && callbackAudio.length > 0 && callbackAudio[0]?.audio_url) {
  // Use callback data directly (faster)
  return processAudioData(callbackAudio, lead);
} else {
  // Fallback to record-info fetch
  const statusData = await fetchRecordInfo(taskId);
  return processAudioData(statusData?.data?.data || statusData?.data?.response?.sunoData, lead);
}
```

### Step 4: Add Error Persistence

Ensure all error states are captured in the lead record:

```javascript
await supabase
  .from("leads")
  .update({
    automation_status: "failed",
    automation_last_error: `[Step: ${stepName}] ${errorMessage}`,
    automation_retry_count: (lead.automation_retry_count || 0) + 1,
  })
  .eq("id", lead.id);
```

---

## Files to Update

| File | Changes |
|------|---------|
| `supabase/functions/automation-suno-callback/index.ts` | Fix audio data extraction path, add detailed logging |
| `supabase/functions/automation-generate-lyrics/index.ts` | Add detailed logging for Gemini request/response |
| `supabase/functions/automation-generate-audio/index.ts` | Add detailed logging for Suno request |
| `supabase/functions/automation-trigger/index.ts` | Add orchestration logging |

---

## Technical Details

### Correct Callback Payload Structure (from Kie.ai docs)

```json
{
  "code": 200,
  "msg": "All generated successfully.",
  "data": {
    "callbackType": "complete",
    "task_id": "2fac****9f72",
    "data": [
      {
        "id": "e231****8cadc7dc",
        "audio_url": "https://example.cn/****.mp3",
        "stream_audio_url": "https://example.cn/****",
        "image_url": "https://example.cn/****.jpeg",
        "prompt": "[Verse] Night city lights shining bright",
        "model_name": "chirp-v3-5",
        "title": "Iron Man",
        "tags": "electrifying, rock",
        "createTime": "2025-01-01 00:00:00",
        "duration": 198.44
      }
    ]
  }
}
```

### Correct Record-Info Response Structure (from Kie.ai docs)

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "5c79****be8e",
    "status": "SUCCESS",
    "response": {
      "sunoData": [
        {
          "id": "e231****8cadc7dc",
          "audioUrl": "https://example.cn/****.mp3",
          "streamAudioUrl": "https://example.cn/****",
          "imageUrl": "https://example.cn/****.jpeg",
          ...
        }
      ]
    }
  }
}
```

**Key difference:** Record-info uses `response.sunoData` with camelCase, while callback uses `data` array with snake_case.

---

## Verification Test Plan

After implementation:

1. **Select a test lead** with quality score ≥ 65
2. **Trigger automation** from Admin panel
3. **Monitor Kie.ai Logs** (https://kie.ai/logs) for:
   - Gemini request (should show chat completion call)
   - Suno request (should show generate call)
4. **Check Edge Function Logs** for:
   - `[LYRICS] Started for lead {id}`
   - `[LYRICS] Completed: {title}`
   - `[AUDIO] Started for lead {id}`
   - `[AUDIO] TaskId saved: {taskId}`
   - `[CALLBACK] Received for taskId: {taskId}`
   - `[CALLBACK] Audio saved: {url}`
5. **Verify in Database:**
   - `automation_lyrics` populated
   - `automation_task_id` saved
   - `full_song_url` / `preview_song_url` saved
   - `automation_status` = "completed"

---

## Success Criteria

| Requirement | Verification |
|-------------|--------------|
| lyrics saved | `automation_lyrics IS NOT NULL` |
| taskId saved | `automation_task_id IS NOT NULL` |
| audio_url saved | `full_song_url IS NOT NULL` |
| lead shows ready status | `automation_status = 'completed'` AND `status = 'song_ready'` |

