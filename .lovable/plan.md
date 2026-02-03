

# Automation Pipeline Plan: Lead → Gemini Lyrics → Suno Audio → Auto-Delivery

## Executive Summary

This plan automates your manual song creation workflow while preserving full manual override capability. The system will use **Kie.ai** to orchestrate **Gemini 3 Pro** (lyrics) and **Suno** (audio), with automatic quality gating and tier-based scheduling.

---

## Current State vs. Target State

```text
CURRENT (Manual - ~20-30 min per song)
┌─────────────────────────────────────────────────────────────────────────────┐
│  Lead captured → You copy to ChatGPT → Copy lyrics to Suno → Pick style     │
│  → Download MP3 → Upload to admin → Schedule send                           │
└─────────────────────────────────────────────────────────────────────────────┘

TARGET (Automated + Manual Override)
┌─────────────────────────────────────────────────────────────────────────────┐
│  Lead captured (quality >= 65%) → Auto-trigger Kie.ai → Gemini lyrics       │
│  → Suno audio → Auto-upload → Auto-schedule 24h delivery                    │
│                                                                             │
│  Admin visibility: See all jobs, retry failures, manual override always    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Database Schema Changes

### Add Automation Columns to Existing `leads` Table

Rather than a separate `song_jobs` table (per ChatGPT's valid concern about source-of-truth conflicts), I'll add columns directly to `leads`:

| Column | Type | Purpose |
|--------|------|---------|
| `automation_status` | text | 'pending', 'lyrics_generating', 'audio_generating', 'completed', 'failed', 'manual' |
| `automation_task_id` | text | Kie.ai task ID for Suno polling |
| `automation_retry_count` | integer | Failed attempts (max 3) |
| `automation_last_error` | text | Most recent error message |
| `automation_started_at` | timestamptz | When automation began |
| `automation_lyrics` | text | Generated lyrics (for admin review) |
| `automation_style_id` | uuid | Which style was used |
| `automation_manual_override_at` | timestamptz | If admin took manual control |

### New `song_styles` Table (Your Style Library)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | Primary key |
| `label` | text | Display name (e.g., "Country Heartfelt Male") |
| `genre_match` | text | Genre to match (e.g., "country") |
| `vocal_gender` | text | 'male', 'female' |
| `suno_prompt` | text | Full style prompt for Suno |
| `is_active` | boolean | Can be auto-selected |
| `usage_count` | integer | How often used (analytics) |

### Admin Settings Table (Quality Threshold)

| Column | Type | Purpose |
|--------|------|---------|
| `key` | text | Setting name (e.g., 'automation_quality_threshold') |
| `value` | text | Setting value (e.g., '65') |
| `updated_at` | timestamptz | Last modified |

---

## Phase 2: Style Library Population

Based on your prompts, I'll create 22 style entries:

| Genre | Male Prompt | Female Prompt |
|-------|-------------|---------------|
| R&B | "smooth contemporary R&B, slow to mid-tempo..." | (same with female vocal) |
| Acoustic | "intimate acoustic singer-songwriter ballad..." | (same with female vocal) |
| Rock | "high-energy rock, driving tempo..." | (same with female vocal) |
| Country | "country rock, mid-tempo, warm and heartfelt..." | (same with female vocal) |
| Pop | "modern pop love song, mid-tempo..." | (same with female vocal) |
| Jazz | "smooth jazz ballad, relaxed tempo..." | (same with female vocal) |
| Hip-Hop | "modern rap and hip-hop, mid-tempo..." | (same with female vocal) |
| Indie Folk | "indie folk, relaxed tempo, warm organic..." | (same with female vocal) |
| Latin Pop | "latin pop, mid-tempo, romantic danceable..." | (same with female vocal) |
| K-Pop | "high-energy K-pop, upbeat tempo..." | (same with female vocal) |
| EDM | "EDM dance track, upbeat tempo..." | (same with female vocal) |

---

## Phase 3: Gemini Lyrics Edge Function

### `automation-generate-lyrics`

Ports your ChatGPT bot instructions to Gemini 3 Pro via Kie.ai:

**System Prompt (from your PDF):**
- You are CustomSong-GPT, a professional lyricist
- Take structured inputs → output Suno-ready lyrics with section labels
- Structure: Intro → Verse 1 → Chorus → Verse 2 → Chorus → Bridge → Final Chorus → Outro
- Mention recipient name 3-7 times naturally
- Match genre vibe (Rock = anthemic, R&B = soulful, etc.)
- Default tone: wholesome, sweet, nostalgic
- Handle low-quality input gracefully

**Output Format:**
```json
{
  "title": "Forever My Valentine",
  "lyrics": "[Intro]\n...\n[Verse 1]\n...",
  "style_hints": ["romantic", "upbeat"]
}
```

---

## Phase 4: Suno Audio Edge Function

### `automation-generate-audio`

Calls Suno via Kie.ai with callback:

```text
POST https://api.kie.ai/api/v1/generate
{
  "prompt": "[Full lyrics with style prompt embedded]",
  "customMode": false,
  "instrumental": false,
  "model": "V3_5",
  "callBackUrl": "https://kjyhxodusvodkknmgmra.supabase.co/functions/v1/automation-suno-callback"
}
```

**Song Selection:** Auto-pick first song (Suno may only return one via API anyway).

---

## Phase 5: Callback Handler with Security

### `automation-suno-callback`

**Security (per ChatGPT's valid concern):**
- Verify request is from Kie.ai (check signature/shared secret if available, or validate task_id exists in our DB)
- Validate lead status is in allowed prior state (`audio_generating`)
- Check `automation_manual_override_at` is NULL before proceeding
- Idempotency: Use deterministic storage path (prevents duplicate uploads on retries)

**On Success:**
1. Download audio from Suno URL (with timeout + size limits)
2. Upload to existing `upload-song` logic (reuses your cover art extraction!)
3. Update lead with `preview_song_url`, `full_song_url`, `song_title`, `cover_image_url`
4. Set `preview_scheduled_at` to 24 hours from lead capture
5. Mark `automation_status = 'completed'`

---

## Phase 6: Trigger Integration

### Option A: Kie.ai Triggers Your App (Recommended)

When lead is captured with `quality_score >= threshold`:
1. Call Kie.ai webhook with lead data
2. Kie.ai orchestrates: Gemini → Suno → callback
3. Your callback handles upload + scheduling

### Option B: Your App Triggers Kie.ai

Modify `capture-lead` function:
1. After inserting lead, check `quality_score >= threshold`
2. If yes, call Kie.ai API to start workflow
3. Store task_id, set `automation_status = 'pending'`

**I recommend Option B** because it keeps control in your app and makes the trigger logic explicit.

---

## Phase 7: Admin UI Enhancements

### Automation Controls in Leads Tab

**New UI Elements:**
1. **Automation Status Badge** on each lead row
   - 🔄 Generating... (yellow)
   - ✅ Completed (green)
   - ❌ Failed (red, with retry button)
   - ✋ Manual (gray)

2. **"Trigger Automation" Button** for manually starting automation on any lead (even low-quality ones)

3. **Quality Threshold Setting** (configurable, default 65%)

4. **Automation Dashboard Section:**
   - Jobs in progress
   - Failed jobs needing attention
   - Success rate metrics

### Manual Override Protection

When admin uploads a song manually:
1. Set `automation_manual_override_at = NOW()`
2. Any pending automation callbacks will check this field and skip writing

---

## Phase 8: Error Handling & Fallback

### Retry Logic

```text
Attempt 1 fails → Wait 5 min → Retry
Attempt 2 fails → Wait 15 min → Retry  
Attempt 3 fails → Mark as "failed"
                  → Show in admin dashboard
                  → Continue processing manually
```

### Failure Notifications

- Red badge count in admin header: "3 failed jobs"
- Toast notification when job fails
- Optional: Email to admin (via existing Brevo setup)

---

## Phase 9: Quality Gating

### Lead Quality Threshold

| Score | Action |
|-------|--------|
| 0-64 | Skip automation, show in "Low Quality" list |
| 65+ | Auto-generate song |

### Admin Manual Trigger

Even for leads below threshold, admin can click "Generate Song" to force automation.

### Content Moderation (Basic)

Before sending lyrics to Suno:
- Check for obvious profanity (regex)
- Check for PII patterns (phone numbers, addresses)
- If flagged, mark for manual review instead of auto-generating

---

## Files to Create

| File | Purpose |
|------|---------|
| Migration: Add automation columns to `leads` | Track automation state |
| Migration: Create `song_styles` table | Style library |
| Migration: Create `admin_settings` table | Configurable threshold |
| `supabase/functions/automation-generate-lyrics/index.ts` | Gemini API call |
| `supabase/functions/automation-generate-audio/index.ts` | Suno API call |
| `supabase/functions/automation-suno-callback/index.ts` | Handle completion |
| `supabase/functions/automation-trigger/index.ts` | Start automation for lead |
| `src/components/admin/AutomationControls.tsx` | Admin UI for automation |
| Update `src/components/admin/LeadsTable.tsx` | Add automation badges/controls |

---

## Secrets Required

| Secret | Purpose |
|--------|---------|
| `KIE_API_KEY` | Kie.ai authentication |

**Important:** I'll prompt you to add this securely rather than pasting in chat.

---

## Integration with Existing Flow

### What Stays the Same

- Manual song upload via admin UI (always available)
- Existing `upload-song` function for cover art extraction
- Existing `process-scheduled-deliveries` cron for sending emails
- All scheduling logic uses `preview_scheduled_at` as source of truth

### What Changes

- New leads with quality >= 65% auto-trigger Kie.ai
- Automation writes to same fields as manual flow
- Admin can see automation status alongside manual controls

---

## Implementation Order

1. **Add KIE_API_KEY secret** (you'll be prompted)
2. **Database migrations** - automation columns + song_styles + admin_settings
3. **Populate style library** - Insert your 22 style prompts
4. **Gemini lyrics function** - Port ChatGPT bot logic
5. **Suno audio function** - Kie.ai integration
6. **Callback handler** - Process completions securely
7. **Trigger function** - Connect lead capture to automation
8. **Admin UI updates** - Automation badges, controls, threshold setting
9. **Testing** - End-to-end with real leads
10. **Expand to orders** - After leads are stable

---

## Technical Notes

### Idempotency (per ChatGPT's concern)
- Storage paths are deterministic: `leads/{LEAD_ID_PREFIX}-full.mp3`
- Callbacks check status before writing (only proceed if `audio_generating`)
- Manual override timestamp prevents late callbacks from overwriting

### Single Source of Truth (per ChatGPT's concern)
- All scheduling uses `preview_scheduled_at` on leads table
- No separate job table to drift out of sync
- Automation columns are supplementary tracking, not control

### Suno Cover Art
- Your current `upload-song` function already extracts APIC ID3 tags
- Suno-generated MP3s include cover art in metadata
- Same extraction logic will work for automated songs

---

## Questions Resolved

1. **API Key** - Will add as secret `KIE_API_KEY`
2. **Style Prompts** - 22 entries from your provided list
3. **ChatGPT Bot Instructions** - Full 7-page PDF captured
4. **Auto-pick** - First song (Option A)
5. **Start with Leads** - Less risky, expand to orders later
6. **Quality Threshold** - 65% default, admin-configurable, plus manual trigger

