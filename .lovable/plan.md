

## Guard Against "Completed Without Audio" + Fix Root Cause

### The Bug

In `process-lead-payment/index.ts` (line 145), when a lead converts to a paid order:

```typescript
automation_status: lead.automation_lyrics ? "completed" : null,
```

This marks the new order as `completed` if lyrics exist, **even if the lead never got a song generated**. This is exactly what happened to Rick Gilmore -- his lead had lyrics but no audio, so when he paid, the order was created as "completed" with no `song_url`, and the pipeline never picked it up again.

### Findings: Other Stuck Records

Queried both `orders` and `leads` tables -- **no other records** are currently stuck with `completed` + missing audio. Rick's was the only one.

### Fix

**1. Fix the root cause in `process-lead-payment/index.ts`** (line 145)

Change:
```typescript
automation_status: lead.automation_lyrics ? "completed" : null,
```
To:
```typescript
automation_status: lead.full_song_url ? "completed" : (lead.automation_lyrics ? "lyrics_ready" : null),
```

Logic: Only mark as `completed` if the lead actually has a song. If it only has lyrics, mark as `lyrics_ready` so the pipeline picks it up for audio generation. If neither, leave null for fresh start.

Also update the `status` field (line 151) similarly -- only set `"delivered"` if there's actually a song:
```typescript
status: lead.full_song_url ? "delivered" : "pending",
delivered_at: lead.full_song_url ? new Date().toISOString() : null,
```

**2. Add a defensive guard in `automation-suno-callback/index.ts`**

Before setting `automation_status: "completed"`, verify the song URL was actually saved successfully by doing a re-read after the update. This is a belt-and-suspenders check.

**3. Add a failsafe in `process-scheduled-deliveries/index.ts`**

Add a new recovery block that catches records where `automation_status = 'completed'` but `song_url IS NULL` (orders) or `preview_song_url IS NULL` (leads), and resets them to `"failed"` so they get retried.

---

### Technical Details

#### Files to Modify

- `supabase/functions/process-lead-payment/index.ts` (line 145, 151-152) -- Fix root cause: only set completed/delivered when song actually exists
- `supabase/functions/process-scheduled-deliveries/index.ts` -- Add failsafe recovery for completed-without-audio records  
- `supabase/functions/automation-suno-callback/index.ts` -- Add post-update verification

#### Failsafe Recovery Block (process-scheduled-deliveries)

After the existing failsafe blocks (~line 135), add:

```typescript
// FAILSAFE: Reset records marked "completed" but missing audio
const { data: completedNoAudio } = await supabase
  .from("orders")
  .select("id, automation_status")
  .eq("automation_status", "completed")
  .is("song_url", null)
  .is("dismissed_at", null)
  .limit(10);

if (completedNoAudio?.length) {
  for (const order of completedNoAudio) {
    console.log(`[FAILSAFE] Order ${order.id} marked completed but has no song_url, resetting to failed`);
    await supabase
      .from("orders")
      .update({
        automation_status: "failed",
        automation_last_error: "Marked completed without song_url - reset by failsafe",
      })
      .eq("id", order.id);
  }
}
```

Same pattern for leads checking `preview_song_url`.

