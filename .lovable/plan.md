

## Speed Up Admin Leads Loading

### Problem
The admin dashboard is loading 8,800+ leads by making ~9 sequential edge function calls (1,000 leads per page). Each call fetches ALL columns for every lead, and each call has to cold-boot the edge function. This results in 30-60+ seconds of loading time.

### Solution: Parallel fetching + lean lead columns

Two changes to dramatically speed this up:

**1. Fetch lead pages in parallel (not sequentially)**

Currently the frontend loops through pages one at a time (`for (let p = 1; p < maxPages; p++)`). Instead, fire all page requests simultaneously using `Promise.allSettled()`. This alone should cut loading time by 5-8x since all pages load concurrently.

**2. Fetch only the columns the Leads table actually needs**

The edge function currently does `SELECT *` on leads, returning ~70 columns per lead including large text blobs like `automation_lyrics`, `automation_raw_callback`, `lyrics_raw_attempt_1`, `lyrics_raw_attempt_2`, etc. The leads table UI only needs about 30 columns. Switching to a specific column list will reduce payload size by roughly 50-60%.

### Technical Details

**File 1: `supabase/functions/admin-orders/index.ts`** (~line 127-131)

Replace `select("*")` for the paginated leads query with a specific column list:
```
id, email, phone, customer_name, recipient_name, recipient_type, 
recipient_name_pronunciation, occasion, genre, singer_preference, 
special_qualities, favorite_memory, special_message, status, 
captured_at, converted_at, order_id, quality_score, 
preview_song_url, full_song_url, song_title, cover_image_url, 
preview_token, preview_sent_at, preview_opened_at, preview_played_at,
preview_play_count, preview_scheduled_at, follow_up_sent_at, 
dismissed_at, utm_source, utm_medium, utm_campaign,
automation_status, automation_started_at, automation_retry_count,
automation_last_error, automation_task_id, automation_style_id,
earliest_generate_at, target_send_at, generated_at, sent_at,
lead_email_override, lead_email_cc, preview_sent_to_emails,
sms_opt_in, sms_sent_at, sms_scheduled_for, phone_e164, sms_status,
lyrics_language_code, inputs_hash, prev_song_url
```

This excludes the heavy columns: `automation_raw_callback`, `automation_lyrics`, `lyrics_raw_attempt_1`, `lyrics_raw_attempt_2`, `automation_audio_url_source`, `lyrics_language_qa`, `prev_automation_lyrics`, `prev_cover_image_url`.

**File 2: `src/pages/Admin.tsx`** (~lines 406-438 and ~lines 492-516)

Replace the sequential `for` loop with parallel fetching in both `handleLogin` and `fetchOrders`:

```typescript
// Fire all remaining pages in parallel
const pagePromises = Array.from({ length: maxPages - 1 }, (_, i) =>
  listOrders("all", i + 1, pageSize)
);
const results = await Promise.allSettled(pagePromises);

for (const result of results) {
  if (result.status === "fulfilled" && result.value.data) {
    const pd = result.value.data;
    if (pd.orders?.length) accOrders = accOrders.concat(pd.orders);
    if (pd.leads?.length) accLeads = accLeads.concat(pd.leads);
  }
}
```

### Expected Impact
- **Parallel fetching**: Loading 9 pages concurrently instead of sequentially -- total time drops from ~45s to ~5-8s
- **Lean columns**: ~50% smaller response payloads per page, faster JSON parsing

### Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/admin-orders/index.ts` | Replace `select("*")` with specific columns for leads pagination |
| `src/pages/Admin.tsx` | Replace sequential page loop with `Promise.allSettled()` parallel fetch in both login and refresh flows |
