

## Clean Up Last False Converted Lead

### Current State

The earlier batch fix already cleaned 102 of the 103 false conversions. There is **1 remaining** false converted lead:

| Lead ID | Email | Occasion | Current Status | Order Created | Lead Created |
|---------|-------|----------|---------------|--------------|--------------|
| `c91121a3...` | sarastuart@ucla.edu | thank-you | `converted` | Mar 10 20:18 | Mar 10 20:27 |

This lead was captured **after** the linked order was already placed — a classic false match. The lead has a generated song (`automation_status: completed`, `full_song_url` present) but no preview was ever sent.

### Fix

Run a single UPDATE to reset this lead:
- **Status**: `song_ready` (song was generated but never previewed/sent)
- **Clear**: `converted_at` → NULL, `order_id` → NULL (remove the false link)

```sql
UPDATE leads
SET status = 'song_ready',
    converted_at = NULL,
    order_id = NULL
WHERE id = 'c91121a3-56e0-43a1-a295-3e3e634a6825'
  AND status = 'converted';
```

This is the only remaining false conversion. All 103 will then be fully cleaned up.

