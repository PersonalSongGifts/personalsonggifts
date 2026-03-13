

## Fix: High "Eligible Now" Count (1954)

### Root Cause

The admin-orders edge function fetches orders with an explicit column list (`orderColumns` on line 84) that **does not include** `reaction_email_24h_sent_at` or `reaction_email_72h_sent_at`. Since these fields are always `undefined` in the client data, the eligibility filter in `ReactionEmailPanel.tsx` treats every delivered order within the cutoff window as eligible — hence 1954.

### Fix

**File: `supabase/functions/admin-orders/index.ts` (line 84)**

Add `reaction_email_24h_sent_at, reaction_email_72h_sent_at` to the `orderColumns` string. This ensures the admin panel receives the actual sent timestamps and can correctly filter out orders that have already been emailed.

One-line change, redeploy the edge function. No other files need modification — the panel's filter logic is already correct.

