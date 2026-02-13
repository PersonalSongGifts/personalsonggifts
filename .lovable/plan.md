

## Fix Valentine Remarketing Sender Email

**Problem:** The remarketing emails are sending from a "noreply" address instead of `support@personalsonggifts.com` because the function reads from the `BREVO_SENDER_EMAIL` secret, which is set to the noreply address.

**Fix:** Hardcode the sender email directly in the valentine remarketing function so it always sends from the correct address.

### Technical Details

**File:** `supabase/functions/send-valentine-remarketing/index.ts`

Change the sender email and name assignments from environment variable lookups to hardcoded values:

- `senderEmail` = `"support@personalsonggifts.com"` (instead of reading `BREVO_SENDER_EMAIL`)
- `senderName` = `"Personal Song Gifts"` (instead of reading `BREVO_SENDER_NAME`)

This is a 2-line change. No other files affected.

