

## Automated Lead Follow-Up: $10 Off for Preview Listeners

### Summary
Build an automated $10-off follow-up email system for leads who played their preview but didn't convert. Includes cron automation, manual batch trigger, admin dashboard with stats, and a VDay10 kill switch.

---

### Files to Change

**1. Database migration — insert admin settings**
- Insert `lead_followup_enabled = false` and `vday10_enabled = false` into `admin_settings`

**2. `supabase/functions/create-lead-checkout/index.ts`**
- Change `LEAD_STANDARD_FOLLOWUP_TOTAL_CENTS` from `4499` to `3999`
- Wrap VDay10 discount logic behind a DB lookup of `vday10_enabled` from `admin_settings` — if `false`, ignore `applyVday10Discount` entirely

**3. `src/pages/SongPreview.tsx`**
- Update followup price: `$44.99` → `$39.99`
- Update followup promo box: remove FULLSONG reference, replace with `"$10 off — no code needed, it's already applied!"`
- Update promo badge: `"50% Off + Extra $5 Auto-Applied"` → `"$10 off — already applied"`
- Keep all VDay10 display branches intact (gated by URL param; server-side pricing is what actually controls the discount via `vday10_enabled`)

**4. `supabase/functions/send-lead-followup/index.ts`**
- Replace email template with the approved copy (subject: `[RecipientName]'s song is still waiting`, new $10 off body)
- Fix race condition: set `follow_up_sent_at` BEFORE calling Brevo
- Add suppression check against `email_suppressions` table
- Add purchase guard (fingerprint match) before sending

**5. `supabase/functions/process-scheduled-deliveries/index.ts`**
- Add Section 9 "Lead Follow-up Emails" before the final response
- Check `lead_followup_enabled` setting — skip if `false`
- Query eligible leads: `preview_play_count > 0`, `status != 'converted'`, `follow_up_sent_at IS NULL`, `dismissed_at IS NULL`, `preview_played_at IS NOT NULL`, `preview_sent_at < NOW() - 24h`, `preview_token IS NOT NULL`, `full_song_url IS NOT NULL`, not in `email_suppressions`
- Cap at 10 per run
- Set `follow_up_sent_at` atomically BEFORE sending, then send via Brevo inline with same template, log to `order_activity_log`

**6. `supabase/functions/admin-orders/index.ts`**
- Add `set_lead_followup_enabled` action — toggles admin setting
- Add `get_lead_followup_stats` action — returns eligible count, total sent, total conversions
- Add `send_batch_followup` action — queries all-time eligible leads (same criteria minus 24h restriction), cap 50, same atomic lock + suppression + purchase guard + send logic, returns count sent

**7. `supabase/functions/send-test-email/index.ts`**
- Update `lead_followup` template HTML and text to match new $10 off copy

**8. New: `src/components/admin/LeadFollowupPanel.tsx`**
- Card titled "Lead Follow-up Emails"
- Toggle for `lead_followup_enabled` (on/off, reads/writes via admin-orders actions)
- Live stats: eligible leads right now, total sent all time, total conversions from follow-ups
- "Send Batch Follow-up" button with confirmation dialog: "This will send up to 50 follow-up emails to leads who played their preview but never purchased. Continue?"
- Shows result count after batch fires

**9. `src/pages/Admin.tsx`**
- Import and add `LeadFollowupPanel` to the automation tab (after `UnplayedResendPanel`)

**10. Deploy edge functions**
- Deploy: `create-lead-checkout`, `send-lead-followup`, `process-scheduled-deliveries`, `admin-orders`, `send-test-email`

---

### Test Send (After Deployment)
Invoke `send-test-email` with template `lead_followup` to `support@personalsonggifts.com` and report which sample data was used, what the preview link resolves to, and confirm checkout shows $39.99.

### Key Safety Measures
- `follow_up_sent_at` set BEFORE Brevo call in all paths (cron, batch, manual)
- `email_suppressions` checked before every send
- Purchase guard (fingerprint match) prevents emailing already-converted leads
- SQL includes `preview_token IS NOT NULL AND full_song_url IS NOT NULL` to prevent broken links
- `lead_followup_enabled` defaults OFF — nothing sends until manually activated
- VDay10 code preserved but dormant behind `vday10_enabled = false`

