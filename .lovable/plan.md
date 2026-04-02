

## Improve Spam/Junk Folder Messaging on Confirmation Pages

### What
Rewrite the spam folder warnings on both `Confirmation.tsx` and `PaymentSuccess.tsx` to sound warmer, more conversational, and less like a bulleted checklist — while still clearly communicating the action needed.

### Changes

**`src/pages/Confirmation.tsx`** (lines 88-100)
- Replace the current amber warning box (bulleted list style) with a friendlier, more concise version
- New copy along the lines of:
  > **One important thing** — your finished song will arrive from **support@personalsonggifts.com**. Sometimes email providers send it to spam or junk by mistake, so if you don't see it in your inbox, check there first. Adding us to your contacts makes sure you won't miss it!
- Keep the Mail icon and amber styling but remove the bullet list format for a more natural read

**`src/pages/PaymentSuccess.tsx`** (around line 412-416)
- Update the existing delivery paragraph to match the same warmer tone
- Same core message: check spam/junk, add to contacts

### Tone
Friendly, helpful, not alarming. Feels like a personal heads-up rather than a legal disclaimer.

### Files
| File | Change |
|------|--------|
| `src/pages/Confirmation.tsx` | Rewrite spam warning box copy |
| `src/pages/PaymentSuccess.tsx` | Rewrite delivery email copy |

