

## Add 10-Day Cutoff to Reaction Video Emails

### Changes

**1. Edge function: `supabase/functions/process-scheduled-deliveries/index.ts`**

After line 1410 (where `cutoff72hReaction` is defined), add:
```typescript
const cutoffOlderReaction = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
```

Then add `.gte("delivered_at", cutoffOlderReaction)` to both queries:
- Phase A (24h) query at ~line 1418
- Phase B (72h) query (similar structure further down)

This ensures orders delivered more than 10 days ago are completely skipped.

**2. Admin UI: `src/components/admin/ReactionEmailPanel.tsx`**

- Update the "Eligible Now" stat calculation to also apply the 10-day window
- Add a note in the panel description: "Only targets orders delivered within the last 10 days."

