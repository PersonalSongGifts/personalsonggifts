
## What I found (why it looks “stuck” + why you didn’t get an email)

### 1) Your latest lead is not stuck in the backend
I checked the most recent lead row for `ryan@hyperdrivelab.com` and it shows:
- `automation_status = completed`
- `status = song_ready`
- `preview_song_url` is present
- `preview_sent_at` is still null (no email sent yet)
- `preview_scheduled_at` is set to ~24 hours after capture

So the song generation actually finished successfully.

### 2) Not receiving an email after 10 minutes is expected with the current design
When the audio callback completes (`automation-suno-callback`), it **does not send the preview email immediately**. It schedules it:
- `preview_scheduled_at = captured_at + 24 hours`

Then the scheduled delivery processor sends the preview email only when `preview_scheduled_at <= now`.

This means “song completed” does not automatically imply “email sent right now” (by design).

### 3) The Admin UI can show stale “Generating Audio” and later “STUCK”
There is a real UI refresh bug:
- In `src/pages/Admin.tsx`, `fetchOrders()` only calls `setLeads(...)` when the **Orders** status filter is `"all"`.
- If you’re filtering orders (Paid/Delivered/etc.), clicking Refresh can update orders but leave the leads list stale, so the Leads UI timer keeps ticking and eventually shows “STUCK” even though the backend already completed.

### 4) Lyrics are being passed into Suno
In `supabase/functions/automation-generate-audio/index.ts`, the Suno request body includes:
- `prompt: lead.automation_lyrics`
- `customMode: true`
So the “lyrics not being provided to Suno” hypothesis does not match the current code.

---

## Changes I will implement (so this stops happening and admin testing becomes fast)

### A) Fix the Admin refresh bug (critical)
**File:** `src/pages/Admin.tsx`

Change `fetchOrders()` so it always refreshes `leads` regardless of `statusFilter`.

Current behavior:
- `setLeads(...)` only runs when `statusFilter === "all"`

New behavior:
- Always run `setLeads(data.leads || [])`
- Keep `setAllOrders(...)` only for `"all"` if you still want that optimization

Result:
- Leads tab will immediately reflect “Completed / Song Ready” instead of appearing stuck.
- Refresh button reliably updates leads.

---

### B) Make “STUCK” detection more accurate (reduce false alarms)
Right now, `automation_started_at` is set at the start of lyrics generation and is not updated when audio generation begins. The Leads UI flags STUCK when:
- `automation_status === "audio_generating"` AND
- `(now - automation_started_at) > 5 minutes`

That can mark jobs “stuck” earlier than intended.

**File:** `supabase/functions/automation-generate-audio/index.ts`

When switching to `automation_status: "audio_generating"`, also set:
- `automation_started_at = now`

Result:
- “STUCK (Xm)” will measure time since audio started (what you actually care about).

(Also improves the automated recovery query in the scheduled processor, since it uses `automation_started_at` as its cutoff.)

---

### C) Fix status name mismatches in the Automation dashboard (consistency cleanup)
There’s a naming mismatch:
- Pipeline uses: `lyrics_generating`, `audio_generating`
- Automation dashboard/backend status logic uses: `generating_lyrics`, `generating_audio`

This makes automation stats and “stuck” logic unreliable in the Automation tab.

**Files:**
1) `supabase/functions/admin-orders/index.ts` (action: `get_automation_status`)
   - Update stats counters and filters to use:
     - `lyrics_generating`
     - `audio_generating`
   - Update `activeJobs` mapping to include the real statuses written by the pipeline.
2) `src/components/admin/AutomationDashboard.tsx`
   - Update badge mapping and stuck detection to use `audio_generating` (not `generating_audio`).

Result:
- Automation tab accurately reflects what’s happening in the pipeline.

---

### D) Make admin/tester emails receive preview emails quickly (so you can actually test end-to-end)
Since you and your team are repeatedly testing, waiting 24 hours for the preview email is not practical.

**Goal:** For emails in `admin_settings.admin_tester_emails`, schedule preview email to send within ~1–2 minutes of completion (without changing behavior for real customers).

**File:** `supabase/functions/automation-suno-callback/index.ts`

Add logic:
1) Load `admin_tester_emails` from `admin_settings`
2) If `lead.email` is in that allowlist:
   - set `preview_scheduled_at = now` (or now + 1–2 minutes)
3) Else keep the existing behavior:
   - `preview_scheduled_at = captured_at + 24 hours`

Result:
- For Ryan/Sara/Golan: preview email arrives quickly after completion (via the existing scheduled processor).
- For real customers: conversion-optimized 24-hour delay stays unchanged.

Note: You already have a manual “Send Now” action in the Leads UI; this change just makes the tester flow automatic.

---

## Testing / validation checklist (end-to-end)
1) In Admin, set Orders filter to something NOT “All” (to reproduce the old bug).
2) Create a lead with `ryan@hyperdrivelab.com`, trigger AI generation.
3) Confirm the Leads tab updates from “Generating Audio” → “Completed / Song Ready” without needing a special filter.
4) Confirm “STUCK” only appears when audio has truly exceeded the threshold (based on audio-start time).
5) Confirm Ryan/Sara/Golan receive the preview email within ~1–2 minutes after completion.
6) Create a non-admin lead and confirm `preview_scheduled_at` still lands ~24 hours later.

---

## Rollout notes / safety
- No database schema changes required (we’ll reuse `admin_settings.admin_tester_emails` which already exists).
- Customer behavior remains unchanged; only allowlisted tester emails get accelerated auto-send.
