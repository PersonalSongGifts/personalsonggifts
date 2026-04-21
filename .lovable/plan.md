

## $19.99 Flash-Sale Remarketing Campaign — Final Plan

72-hour flash sale to ~17,688 cold US leads who got their preview but never bought. Modeled on existing Valentine remarketing pattern.

### Audience (unchanged from approved plan)

A lead is eligible only if **all** of these are true:
- `preview_sent_at IS NOT NULL` AND `preview_song_url IS NOT NULL`
- `status != 'converted'` AND `dismissed_at IS NULL`
- `captured_at < now() - interval '5 days'`
- `last_promo_email_sent_at IS NULL` OR older than 30 days
- Email **not** in `email_suppressions`
- Email **not** present in `orders` as `customer_email` of any non-cancelled order
- `timezone` starts with `America/` (US-only)

### Email content

- **Subject (with name):** `${recipientName}'s song — $19.99 for 72 hours`
- **Subject (null/empty fallback):** `Your song — $19.99 for 72 hours`
- **Body:** Plain personal style (Arial, white bg, bare links). Reminds them their preview is waiting, offers full song at **$19.99 USD** (vs. $99.99) as 72-hour flash sale. CTA → `https://personalsonggifts.com/preview/{preview_token}?promo=flash20`
- Standard footer + List-Unsubscribe headers
- Sent from `support@personalsonggifts.com`

### Promo activation (key change: 72h, activated on first send)

- Migration creates `FLASH20` promo row with `is_active = false`, `lead_price_cents = 1999`, no banner
- On the **first batch send** (canary or full), the edge function flips `is_active = true` and sets `starts_at = now()`, `ends_at = now() + interval '72 hours'`
- This way the 72-hour clock starts when emails actually go out, not at migration time
- The existing checkout code already reads `lead_price_cents` from active promos — `?promo=flash20` URL just enables the funnel; pricing is enforced server-side via the active promo lookup

### Sending mechanics

- **New edge function:** `send-flash20-remarketing` (POST, admin-password gated)
- Atomically claims a batch by setting `last_promo_email_sent_at = now()` BEFORE sending (race-safe)
- Per-email guards at send time: re-check `orders` table, re-check `email_suppressions`
- `recipient_name` null/empty guard for subject line fallback
- Logs each send to `order_activity_log` with `event_type='flash20_sent'`
- Hard cap of 1,000 sends per invocation (Brevo rate limit protection)

### Admin panel

New `Flash20RemarketingPanel.tsx` in the **Emails** tab (clone of `ValentineRemarketingPanel`):
- Eligible count (live)
- Total sent / progress bar
- Batch size input (default 500)
- **Send canary (100)** → review → **Resume full send**
- Pause / Resume toggle
- Test send to comma-separated emails
- Reset campaign button
- Stats: Sent / Converted / Revenue attributed (joins `last_promo_email_sent_at` → `converted_at` → order price)
- **Promo expiry countdown** showing time remaining once activated

### Safety defaults

- Starts **paused**
- Canary must be sent and reviewed before full batches unlock
- 30-day re-send guard via `last_promo_email_sent_at`
- 72h promo auto-expires (checkout falls back to standard pricing after `ends_at`)

### Files

**New:**
- `supabase/functions/send-flash20-remarketing/index.ts` — sender, canary/batch logic, promo activation on first send, recipient_name null guard
- `src/components/admin/Flash20RemarketingPanel.tsx` — admin UI with countdown
- Migration: insert `FLASH20` promo row (inactive, lead_price_cents=1999, no banner) + insert `flash20_remarketing` admin_settings row (`{ enabled: false, batch_size: 500, total_sent: 0, canary_sent: false, activated_at: null }`)

**Edit:**
- `src/pages/Admin.tsx` — render new panel under Emails tab
- `supabase/functions/automation-get-settings/index.ts` — expose `flash20_remarketing` key

