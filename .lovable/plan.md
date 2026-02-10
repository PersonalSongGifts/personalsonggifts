
## Fix: Songs Delivered Without Lyrics (Lead Conversion Bug)

### Problem
When a lead converts to a paid order, the system copies the song file, title, and cover image -- but **forgets to copy the lyrics**. Every lead-converted order is delivered with "Lyrics aren't available for this song yet" even though the lyrics exist on the original lead record.

This affects all lead conversions (the majority of orders based on the data -- 15+ recent orders are missing lyrics).

### Root Cause
In `process-lead-payment/index.ts` (the function that creates an order when a lead pays), the INSERT statement on line 121-148 copies these lead fields:
- `full_song_url` -> `song_url`
- `song_title`
- `cover_image_url`

But does NOT copy:
- `automation_lyrics` (the actual lyrics text)
- `automation_status` (should be "completed")
- `lyrics_language_code` (language setting)
- `song_title` from automation (already copied, but good to confirm)

### Solution

**1. Fix the lead conversion INSERT** (`process-lead-payment/index.ts`)

Add the missing fields to the order insert:
- `automation_lyrics: lead.automation_lyrics`
- `automation_status: "completed"` (since the song is already done)
- `lyrics_language_code: lead.lyrics_language_code || "en"`
- `inputs_hash: lead.inputs_hash` (for change detection consistency)

**2. Backfill existing orders** (one-time data fix)

Run a SQL update to copy lyrics from converted leads to their corresponding orders where lyrics are missing. The `leads` table has an `order_id` field that links directly to the order.

```text
UPDATE orders o
SET automation_lyrics = l.automation_lyrics,
    automation_status = 'completed'
FROM leads l
WHERE l.order_id = o.id
  AND l.automation_lyrics IS NOT NULL
  AND o.automation_lyrics IS NULL;
```

### Pitfalls Addressed

1. **Race condition**: What if the lead hasn't finished generating lyrics when the customer pays? The INSERT will copy `null` lyrics. To handle this, after the order is created, we add a fallback check: if `automation_lyrics` is null, trigger `automation-generate-lyrics` for the new order (same pattern already used in `upload-song`).

2. **Language code missing**: Without copying `lyrics_language_code`, any fallback lyrics generation would default to English even if the lead was in Spanish. The fix copies this field.

3. **Future fields forgotten again**: As new fields are added to leads, they may again be forgotten during conversion. A code comment will be added to flag this as a "sync point" for future developers.

### Files Changed
- `supabase/functions/process-lead-payment/index.ts` -- Add missing fields to the order INSERT + fallback lyrics trigger
- One-time data backfill query for existing affected orders
