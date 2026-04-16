
## Plan: Lead Revisions + Dynamic Sale Banner

Going with all three recommended defaults: 1 revision, auto-approve, 12h timer from submission.

### Part 1: Lead self-service revisions

**Migration:**
- Add to `leads`: `revision_token uuid default gen_random_uuid()`, `revision_count int default 0`, `max_revisions int default 1`, `revision_requested_at timestamptz`, `revision_status text`, `revision_reason text`, `pending_revision boolean default false`
- Add to `revision_requests`: `lead_id uuid` nullable; make `order_id` nullable; CHECK that exactly one of `order_id`/`lead_id` is set
- Backfill `revision_token` for existing leads

**`get-revision-page`:** If token doesn't match an order, look up by `leads.revision_token`. Return same response shape with `form_type: "lead_revision"`.

**`submit-revision`:** Detect lead vs order. For leads:
- Insert into `revision_requests` with `lead_id`
- Auto-approve immediately (no admin setting check for leads)
- Backup `preview_song_url` → `prev_song_url`, `automation_lyrics` → `prev_automation_lyrics`, `cover_image_url` → `prev_cover_image_url` (use existing `backupSongFile` helper pattern)
- Clear automation fields on the lead
- Set `target_send_at = now() + 12h`, `revision_status = 'processing'`, increment `revision_count`
- Trigger `automation-trigger` for the lead
- Log activity

**`process-scheduled-deliveries`:** Add a lead branch — find leads where `revision_status='processing'` AND `automation_status='completed'` AND `preview_song_url IS NOT NULL` AND `target_send_at <= now()`. Call `send-lead-preview` with `resend: true`, set `revision_status='approved'`.

**`SongRevision.tsx`:** Handle `form_type: "lead_revision"` — copy reads "Your updated 45-second preview will be sent within ~12 hours."

**Revision links:** Add "Want changes? [Request a revision](/song/revision/{token})" to lead preview, follow-up, and remarketing emails.

### Part 2: Dynamic promo banner in lead emails

**New shared helper `_shared/email-promo-banner.ts`:**
- `getActivePromo(supabase)` — query `promotions` where `is_active=true` AND now between `starts_at`/`ends_at`
- `renderPromoBannerHtml(promo)` — returns HTML banner styled with `banner_bg_color`/`banner_text_color`/`banner_emoji`/`banner_text`, including the actual `standard_price_cents` formatted (e.g. "Full song just $39.99 — normally $99.99")
- `renderPromoBannerText(promo)` — plain-text equivalent
- Returns empty string if no active promo

**Apply to:** `send-lead-preview`, `send-lead-followup` (replace inline promo logic), `send-valentine-remarketing`. Banner sits at top of HTML body and top of text body.

### Files

| File | Change |
|---|---|
| `supabase/migrations/<new>.sql` | Lead revision columns + `revision_requests.lead_id` |
| `supabase/functions/get-revision-page/index.ts` | Resolve lead tokens |
| `supabase/functions/submit-revision/index.ts` | Lead branch with auto-approve + backup + schedule |
| `supabase/functions/process-scheduled-deliveries/index.ts` | Dispatch lead preview after regen completes |
| `supabase/functions/_shared/email-promo-banner.ts` | NEW shared banner renderer |
| `supabase/functions/send-lead-preview/index.ts` | Banner + revision link |
| `supabase/functions/send-lead-followup/index.ts` | Use shared banner + revision link |
| `supabase/functions/send-valentine-remarketing/index.ts` | Banner + revision link |
| `src/pages/SongRevision.tsx` | `lead_revision` copy |

Memory updates after build: extend self-service-revisions and lead-recovery-system entries to note lead revision support; add a small entry for the shared email promo banner helper.
