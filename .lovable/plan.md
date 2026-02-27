

## Urgent Production Bug Fixes

### Overview
Fix two critical bugs affecting paying customers, add preventive measures, update CS tooling, and run diagnostics. Seven distinct changes across ~13 edge function files.

---

### 1. Create shared constants file

**New file:** `supabase/functions/_shared/constants.ts`

```typescript
export const SITE_URL = "https://www.personalsonggifts.com";
```

This single constant replaces all hardcoded `personalsonggifts.lovable.app` URLs across the codebase.

---

### 2. Replace all `personalsonggifts.lovable.app` with `SITE_URL`

Import and use `SITE_URL` in every file that currently hardcodes the lovable.app domain:

| File | Approx occurrences |
|------|-------------------|
| `send-lead-preview/index.ts` | 5 |
| `send-lead-followup/index.ts` | 4 |
| `send-song-delivery/index.ts` | 7 |
| `send-order-confirmation/index.ts` | 5 |
| `send-test-email/index.ts` | ~15 |
| `send-valentine-remarketing/index.ts` | 1 |
| `process-scheduled-deliveries/index.ts` | ~12 |
| `admin-orders/index.ts` | 2 |
| `create-checkout/index.ts` | 1 |
| `create-lead-checkout/index.ts` | 1 |
| `create-lyrics-checkout/index.ts` | 1 |

Each instance of `https://personalsonggifts.lovable.app` becomes `${SITE_URL}`.

---

### 3. Fix case-sensitive email matching (BUG 1)

Replace `.eq("customer_email", ...)` with `.ilike("customer_email", ...)` in these purchase guard locations:

- `process-scheduled-deliveries/index.ts` (line ~944)
- `send-lead-preview/index.ts` (line ~71)
- `send-lead-followup/index.ts` (line ~70)
- `automation-trigger/index.ts` (line ~93)

---

### 4. Normalize emails on intake (preventive)

- `create-order/index.ts`: The email is already lowercased (`.trim().toLowerCase()` on line inserting `customer_email`). Confirmed -- no change needed here.
- `capture-lead/index.ts`: Already normalizes to `normalizedEmail = input.email.trim().toLowerCase()`. No change needed.

Both intake paths already lowercase. The `.ilike()` fix covers any legacy data with mixed casing.

---

### 5. Change lead preview email subject line

In both `send-lead-preview/index.ts` and `process-scheduled-deliveries/index.ts`, change:
```
subject: `Your song for ${lead.recipient_name} is ready`
```
To:
```
subject: `Here's a preview of your song for ${lead.recipient_name}`
```

This makes the lead preview email clearly distinguishable from the order delivery email.

---

### 6. Update CS Assistant system prompt

Add a new scenario to the system prompt in `cs-draft-reply/index.ts` (after the existing scenario-specific instructions around line 120):

```
- "Being asked to pay again" / received preview link instead of full song / email contains /preview/ URL -> This is a known issue where they received a lead preview email instead of their order delivery. Look up their order, confirm it's paid and completed, and send them the direct song_url link immediately. Apologize for the confusion. Example: "So sorry about that confusion! Your song is fully paid for and ready. Here's your direct link to listen: [song_url]. No additional payment needed -- that was sent in error. We apologize for any worry this caused!"
```

---

### 7. Backfill revision_token on existing orders

Run a data update:
```sql
UPDATE orders SET revision_token = gen_random_uuid() WHERE revision_token IS NULL;
```

---

### 8. Diagnostic query

After all fixes are deployed, run:
```sql
SELECT l.email as lead_email, o.customer_email as order_email, l.preview_sent_at, o.id as order_id, o.customer_name
FROM leads l
JOIN orders o ON LOWER(l.email) = LOWER(o.customer_email)
WHERE l.preview_sent_at IS NOT NULL
AND o.price_cents IS NOT NULL
AND o.price_cents > 0;
```

Share results so you can proactively reach out to affected customers.

---

### Files modified (summary)

| File | Changes |
|------|---------|
| `_shared/constants.ts` | NEW -- shared SITE_URL constant |
| `send-lead-preview/index.ts` | SITE_URL import, .ilike() fix, new subject line |
| `send-lead-followup/index.ts` | SITE_URL import, .ilike() fix |
| `send-song-delivery/index.ts` | SITE_URL import |
| `send-order-confirmation/index.ts` | SITE_URL import |
| `send-test-email/index.ts` | SITE_URL import |
| `send-valentine-remarketing/index.ts` | SITE_URL import |
| `process-scheduled-deliveries/index.ts` | SITE_URL import, .ilike() fix, new subject line |
| `admin-orders/index.ts` | SITE_URL import |
| `create-checkout/index.ts` | SITE_URL import |
| `create-lead-checkout/index.ts` | SITE_URL import |
| `create-lyrics-checkout/index.ts` | SITE_URL import |
| `automation-trigger/index.ts` | .ilike() fix |
| `cs-draft-reply/index.ts` | New scenario in system prompt |
| Database | Backfill revision_token + diagnostic query |

