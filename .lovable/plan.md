

# Replace Fake Address with Real Address in All Email Templates

## What's Changing

Replace **all instances** of the fake placeholder addresses with:

**2108 N ST STE N, SACRAMENTO, CA 95816**

## Files to Update (6 total)

| File | Current Fake Address |
|------|---------------------|
| `supabase/functions/send-order-confirmation/index.ts` | 2323 Music Row, Nashville, TN 37212 |
| `supabase/functions/send-song-delivery/index.ts` | 2323 Music Row, Nashville, TN 37212 |
| `supabase/functions/send-lead-preview/index.ts` | 123 Music Lane, Nashville, TN 37203 |
| `supabase/functions/send-lead-followup/index.ts` | 123 Music Lane, Nashville, TN 37203 |
| `supabase/functions/process-scheduled-deliveries/index.ts` | 2323 Music Row, Nashville, TN 37212 |
| `supabase/functions/send-test-email/index.ts` | 2323 Music Row, Nashville, TN 37212 |

Each file has the address in **both** the HTML email template and the plain-text alternative -- so roughly 12 individual replacements total.

## Technical Details

Each function has two spots:
1. **HTML footer** -- inside a `<p>` tag at the bottom of the email
2. **Plain-text footer** -- in the `textContent` string near the bottom

Both will be updated to: `2108 N ST STE N, SACRAMENTO, CA 95816`

All 6 functions will be redeployed after the edits.

