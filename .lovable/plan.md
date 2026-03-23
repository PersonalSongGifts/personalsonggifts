

## Fix: Preview Token Overwritten on Regeneration

### Problem
When a lead's song is regenerated (e.g., creative fields changed), the `automation-suno-callback` generates a **new preview token** every time, overwriting the previous one. If a preview email was already sent with the old token, that link becomes permanently broken — returning "Preview not found."

This is what happened to Amoya (andreabrown3818@gmail.com):
- March 21: First audio generated → token `HCeFE3sfDgpsNWhJ`
- March 22: Creative fields updated → second audio generated → token overwritten to `34PWmQnMawX7MHc3`
- The email she received contains the old, now-invalid token

### Fix

**`supabase/functions/automation-suno-callback/index.ts`** (~line 715-717)

Change the token generation to preserve existing tokens:

```typescript
// Only generate a new preview token if the lead doesn't already have one
const previewToken = entity.preview_token || generatePreviewToken();
```

This requires that the `entity` query (which fetches the lead) already includes `preview_token` in its SELECT. I'll verify and add it if missing.

### Immediate Fix for This Customer

Also need to update this specific lead's token back to the one in her email, or resend the preview email with the correct (current) token. Recommend resending via admin.

### Files Changed
- `supabase/functions/automation-suno-callback/index.ts` — preserve existing preview_token on regeneration

