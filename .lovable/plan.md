

## Diagnosis: Download Unlocks shows $0 despite real data

### What's actually in the database

I queried the `orders` table directly:

| Metric | Value |
|---|---|
| Orders with `download_unlocked_at` set | **2,501** |
| Of those, **paid** ($19.99) downloads | **58** = **$1,710.61** |
| Comped (free) unlocks (CS gave access) | 2,443 |
| Earliest unlock | 2026-04-06 |
| Latest unlock | today |

So the download upsell IS converting — 58 customers paid $19.99 in the last ~2 weeks. The dashboard showing **$0** is wrong.

### Why the dashboard shows $0

The frontend code (`StatsCards.tsx`) is correct — it reads `download_unlocked_at` and `download_price_cents` from each order and sums them. The edge function source (`admin-orders/index.ts`) also correctly includes both columns in its `SELECT` statement.

But the live deployed `admin-orders` function appears to still be running the **previous version** (before we added those two columns). When the deployed SELECT doesn't include a column, Supabase returns `undefined` for that field on every row — making `download_price_cents ?? 0` always `0` and `o.download_unlocked_at` always falsy. Result: Download Unlocks card = `$0`, `0 customers · 0% attach`. This also explains why Lyrics Unlocks works fine — that column was already in the deployed version.

### The fix

**Re-deploy `supabase/functions/admin-orders/index.ts`** so the live function picks up `download_unlocked_at, download_price_cents` (already in the source on lines 84 and 116). No code changes needed — just a redeploy.

I'll do this by making a no-op touch to the file (e.g., adding a deploy-bump comment at the top) which forces Lovable to redeploy it. After redeploy, the admin should see the **Download Unlocks** card populate to roughly **$1,711 · 2,501 customers · ~X% attach**, and **Total Revenue** + **Total Upsell Revenue** will jump up by the same $1,711 — bringing the dashboard much closer in line with Stripe's reported totals.

### Files to change

- **Edit** `supabase/functions/admin-orders/index.ts` — add a single deploy-bump comment near the top to force redeploy. No logic changes.

### Verification after deploy

Reload the admin page, look at the **Upsell Performance** row:
- Download Unlocks should show **$1,711 · 2,501 customers · ~X% attach** (instead of `$0 · 0 customers · 0% attach`)
- Total Revenue's sub-line should now show a non-zero `DL $...` segment
- Total Upsell Revenue should rise by ~$1,711

If after redeploy it's still $0, the next step would be to inspect a sample order in the network response from `admin-orders` to confirm whether `download_price_cents` is present in the JSON payload, which would point to a deeper issue (e.g., RLS or Postgres column-level security) rather than a stale deploy.

