

# Automation Pipeline Improvements Based on Kie.ai Documentation

## Summary of Changes

After reviewing the Kie.ai documentation, I've identified several improvements to optimize the automation pipeline.

---

## Issue 1: Using Custom Mode for Better Song Quality

**Current Implementation:**
```javascript
customMode: false,
```

**Problem:** In non-custom mode, we're cramming both style and lyrics into a single `prompt` field.

**Better Approach:** Use `customMode: true` with separate `style`, `title`, and `prompt` (lyrics) fields for cleaner separation.

**Fix:**
```javascript
{
  prompt: lead.automation_lyrics,      // Lyrics only
  style: selectedStyle.suno_prompt,    // Style prompt separately
  title: lead.song_title,              // Title separately
  customMode: true,
  instrumental: false,
  model: "V4_5",                        // Upgrade to V4_5 for smarter prompts
  callBackUrl: callbackUrl,
}
```

---

## Issue 2: Model Selection

**Current:** Using `V3_5`

**Recommendation from docs:**
- **V3_5:** Better song structure, max 4 minutes
- **V4:** Improved vocals, max 4 minutes  
- **V4_5:** Smart prompts + faster generation, max 8 minutes (recommended)
- **V5:** Fastest with superior musicality

**Fix:** Upgrade to `V4_5` for smart prompt handling and faster generation.

---

## Issue 3: Gemini API Parameters

**Current Implementation:**
```javascript
{
  stream: false,
  include_thoughts: false,
  reasoning_effort: "high",
  messages: [...]
}
```

**Observation:** According to the docs, `include_thoughts` and `reasoning_effort` may not be standard parameters for Gemini 3 Pro. The standard OpenAI-compatible format should just use `stream` and `messages`.

**Fix:** Simplify to documented parameters only:
```javascript
{
  stream: false,
  messages: [
    { role: "developer", content: SYSTEM_PROMPT },  // Use "developer" role per docs
    { role: "user", content: userPrompt },
  ],
}
```

---

## Issue 4: Enhanced Error Handling for Suno Statuses

**Current:** Only checking for `SUCCESS` and `FIRST_SUCCESS`

**Full Status List from Docs:**
- `PENDING` - Still processing
- `TEXT_SUCCESS` - Lyrics generated (not applicable for our use)
- `FIRST_SUCCESS` - First track ready
- `SUCCESS` - All tracks ready
- `CREATE_TASK_FAILED` - Task creation failed
- `GENERATE_AUDIO_FAILED` - Audio generation failed
- `SENSITIVE_WORD_ERROR` - Content filtered
- `CALLBACK_EXCEPTION` - Callback error

**Fix:** Add explicit handling for error statuses in the callback:
```javascript
switch (task?.status) {
  case "SUCCESS":
  case "FIRST_SUCCESS":
    // Process audio...
    break;
  case "CREATE_TASK_FAILED":
  case "GENERATE_AUDIO_FAILED":
    // Mark as failed with specific error
    break;
  case "SENSITIVE_WORD_ERROR":
    // Content was filtered - mark for manual review
    break;
  case "PENDING":
    // Still processing, callback will come again
    break;
}
```

---

## Issue 5: Boost Style Feature (Optional Enhancement)

The docs mention a "Boost Music Style" API for V4_5 models:
```javascript
POST https://api.kie.ai/api/v1/style/generate
{ "content": "Pop, Mysterious" }
// Returns enhanced style description
```

This could improve song quality by expanding our style prompts before sending to Suno.

---

## Files to Update

| File | Changes |
|------|---------|
| `supabase/functions/automation-generate-audio/index.ts` | Switch to customMode, upgrade to V4_5, separate style/title/lyrics |
| `supabase/functions/automation-generate-lyrics/index.ts` | Simplify Gemini params, use "developer" role |
| `supabase/functions/automation-suno-callback/index.ts` | Enhanced status handling for all error states |

---

## Technical Details

### automation-generate-audio Changes

1. Switch from `customMode: false` to `customMode: true`
2. Pass `style`, `title`, and `prompt` as separate fields
3. Upgrade model from `V3_5` to `V4_5`

### automation-generate-lyrics Changes

1. Use `developer` role instead of `system` (per Gemini 3 Pro docs)
2. Remove non-standard parameters (`include_thoughts`, `reasoning_effort`)

### automation-suno-callback Changes

1. Add explicit handling for `GENERATE_AUDIO_FAILED` status
2. Add handling for `SENSITIVE_WORD_ERROR` (content filtering)
3. Log more detailed error messages from `task.errorMessage`

---

## No Database Changes Required

All changes are to edge function logic only.

