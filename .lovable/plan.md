
# Update Email Sender Identity

## Summary
Update all transactional email edge functions to use the new sender identity with reply-to support.

**Current state:**
- From email: reads `BREVO_SENDER_EMAIL` secret (fallback: `noreply@personalsonggifts.com`)
- From name: reads `BREVO_SENDER_NAME` secret (fallback: `Personal Song Gifts`)
- Reply-To: not set

**Target state:**
- From email: `support@personalsonggifts.com` (hardcoded, no fallback)
- From name: `Personal Song Gifts` (hardcoded)
- Reply-To: `support@personalsonggifts.com`

---

## Changes Required

### Edge Functions to Update (6 files)

| File | Current | Change |
|------|---------|--------|
| `send-order-confirmation/index.ts` | Uses env vars + fallback | Hardcode values + add Reply-To |
| `send-song-delivery/index.ts` | Uses env vars + fallback | Hardcode values + add Reply-To |
| `send-lead-preview/index.ts` | Uses env vars + fallback | Hardcode values + add Reply-To |
| `send-lead-followup/index.ts` | Uses env vars + fallback | Hardcode values + add Reply-To |
| `send-test-email/index.ts` | Uses env vars + fallback | Hardcode values + add Reply-To |
| `process-scheduled-deliveries/index.ts` | Uses env vars + fallback | Hardcode values + add Reply-To |

---

## Technical Details

### Code Changes Per File

Replace this pattern:
```typescript
const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL") || "noreply@personalsonggifts.com";
const senderName = Deno.env.get("BREVO_SENDER_NAME") || "Personal Song Gifts";
```

With hardcoded values:
```typescript
const senderEmail = "support@personalsonggifts.com";
const senderName = "Personal Song Gifts";
```

And update the Brevo API call to include `replyTo`:
```typescript
body: JSON.stringify({
  sender: { name: senderName, email: senderEmail },
  replyTo: { email: senderEmail, name: senderName },  // NEW
  to: [...],
  subject: ...,
  htmlContent: ...,
}),
```

### After Implementation
- All customer replies will go to `support@personalsonggifts.com`
- No more `noreply@` appearing in emails
- Consistent identity across all email types
