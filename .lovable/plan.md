

# Fix Background Automation: Orders + Leads Not Processing

## The Problem

When you have automation enabled with target set to "Both", **nothing gets processed automatically**. You have **224 leads stuck in "queued" status** that never moved forward, and new orders/leads aren't being picked up either.

## Root Cause: Two Bugs Working Together

**Bug 1: The cron job and the trigger function fight each other**

The per-minute cron job (`process-scheduled-deliveries`) picks up eligible items and marks them as `queued`, then calls `automation-trigger` to process them. But `automation-trigger` has a safety check that blocks any item already in `queued` status -- it thinks it's "already running." So items get marked as queued and then immediately rejected. They're stuck forever.

**Bug 2: No quality filter in the cron pickup**

The quality threshold check only happens inside `automation-trigger` (which runs after the item is already set to "queued"). If a lead fails the quality check, it stays stuck in "queued" status permanently because nothing ever resets it.

**Also missing:**
- No global concurrency cap (you want max 9 total in-flight at any time)
- Leads are sorted by quality score instead of oldest-first as you want
- No way to know how many are actively being processed across both tables

## The Fix (3 Parts)

### Part 1: Fix automation-trigger to accept "queued" status

Remove `"queued"` from the list of statuses that block processing. The cron legitimately sets items to "queued" as a claim mechanism before calling the trigger. The trigger should accept "queued" as a valid starting state.

**File:** `supabase/functions/automation-trigger/index.ts`
- Change the blocking check from `["pending", "lyrics_generating", "audio_generating", "queued"]` to `["pending", "lyrics_generating", "audio_generating"]`

### Part 2: Add concurrency cap + quality filter + oldest-first ordering to the cron

Update `process-scheduled-deliveries` (the cron job) to:

1. **Count active jobs first**: Before picking up new items, count how many are currently in-flight (`queued`, `pending`, `lyrics_generating`, `audio_generating`) across BOTH orders and leads tables combined
2. **Cap at 9 total**: Only pick up enough new items to reach 9 total in-flight (e.g., if 6 are already running, only pick up 3 more)
3. **Apply quality threshold in the cron query**: Filter leads by quality score at pickup time so low-quality leads never get claimed
4. **Order leads oldest-first**: Change from `quality_score DESC` to `captured_at ASC` so the oldest eligible lead gets processed first
5. **Orders still get priority**: Process orders first, then fill remaining slots with leads

**File:** `supabase/functions/process-scheduled-deliveries/index.ts`
- Replace `MAX_GENERATIONS_PER_RUN = 3` with `MAX_CONCURRENT_GENERATIONS = 9`
- Add concurrency counting logic before the pickup queries
- Add `.gte("quality_score", qualityThreshold)` to the leads query
- Change lead ordering to `captured_at ASC`

### Part 3: Unstick the 224 queued leads

SQL migration to reset all leads stuck in `queued` status back to `automation_status = NULL` so the fixed cron can re-evaluate and pick them up properly.

## How It Will Work After the Fix

```text
Every minute, the cron runs:
  1. Count active jobs (orders + leads in queued/pending/generating states)
  2. Calculate remaining slots: 9 - active_count
  3. If slots available:
     a. Pick up ORDERS first (priority tier first, then by generate time)
     b. With remaining slots, pick up LEADS (oldest first, quality >= threshold)
  4. For each picked item: set to "queued", call automation-trigger
  5. Trigger accepts "queued" status, proceeds to generate lyrics + audio
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/automation-trigger/index.ts` | EDIT | Remove "queued" from blocking check |
| `supabase/functions/process-scheduled-deliveries/index.ts` | EDIT | Add concurrency cap of 9, quality filter, oldest-first ordering |
| Database migration | CREATE | Reset 224 stuck "queued" leads to null |

## What Happens Immediately After Deploy

- The 224 stuck leads reset to eligible status
- Next cron run (within 60 seconds) counts active jobs, picks up to 9 items
- Orders get processed first, then leads fill remaining slots
- System continuously processes the backlog at up to 9 concurrent, prioritizing orders

