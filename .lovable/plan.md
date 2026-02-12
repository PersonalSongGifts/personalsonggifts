

## Safest Changes to Implement Before You're Away

I agree with ChatGPT's framework -- additive, behind existing guards, no core logic changes. Here's my take on each item, reordered by actual safety:

### IMPLEMENT NOW (Truly zero-risk)

**1. Fix lyrics guard placement (swap 2 code blocks)**
Right now the audio-exists guard (line 209) runs BEFORE the manual override check (line 220) in `automation-generate-lyrics`. This means if an admin does "Regenerate Song" and clears lyrics but forgets to clear the song URL, the guard blocks regeneration and you'd get a support ticket you can't fix remotely.

The fix is literally swapping the order of two if-blocks -- manual override check first, then audio guard. No new logic, just correct sequencing of existing guards.

**2. Fix cron preview sender to respect email override (1-line change)**
In `process-scheduled-deliveries/index.ts` line 1031, the auto-preview sender uses `lead.email` directly. The manual sender already correctly uses `lead.lead_email_override || lead.email`. This is a single line change:
```
to: [{ email: lead.lead_email_override || lead.email, name: lead.customer_name }]
```
Also apply to the unsubscribe links in the same email template that hardcode `lead.email`.

Why safe: only affects leads where you've manually corrected an email. Currently those corrections are silently ignored by the cron, so this can only improve things.

**3. Soften spam trigger language in cron preview email**
In `process-scheduled-deliveries/index.ts` lines 994-998, change "50% Off Today!" to something softer like "Special offer inside" or "Complete your order for the full song." Same for the plain text version at line 1042.

Why safe: copy-only change, no logic affected.

---

### SKIP FOR NOW (ChatGPT suggested but I'd wait)

**Store more debug data / expand Suno URL extraction**: The callback handler already has comprehensive normalization (lines 31-102 of `automation-suno-callback`) checking 8 URL variants, logging which field was used, and storing the raw callback payload (line 299-306). This is already done. Adding more logging has diminishing returns and risks introducing a typo in the callback handler -- the single most critical function in your pipeline.

**Cache busting for regenerated songs**: The `upload-song` function already appends `?v=timestamp` to URLs. The `automation-suno-callback` handler does too. This is already implemented. The only gap would be in the admin "Regenerate Song" flow, but touching that flow before you leave is exactly the kind of thing that could cause fires.

**Add Brevo tags**: Requires touching every email-sending function. Low risk per change but high surface area -- if a typo breaks the Brevo API call JSON, emails stop sending entirely. Do this when you're around to monitor.

---

### Technical Details

**File 1: `supabase/functions/automation-generate-lyrics/index.ts`**
- Move lines 209-217 (audio guard) to AFTER lines 220-226 (manual override check)
- Net effect: admin overrides always take priority, but automated paths still can't overwrite paired lyrics

**File 2: `supabase/functions/process-scheduled-deliveries/index.ts`**
- Line 1031: Change `lead.email` to `lead.lead_email_override || lead.email`
- Line 1053: Same change in unsubscribe URL
- Line 1014: Same change in HTML unsubscribe link
- Lines 994-998: Change "50% Off Today!" to softer language
- Line 1042: Same in plain text version

Total: 2 files, ~8 lines changed, all additive or copy-only.
