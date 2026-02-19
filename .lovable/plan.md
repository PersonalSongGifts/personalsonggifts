
## Fix Order 6EE72CAA — Two Separate Issues

### Issue 1: Song Page Shows "Song Is Not Ready Yet"

**Root cause:** The order status is `completed`. The `get-song-page` edge function has a hard check:

```
if (!["delivered", "ready"].includes(order.status) || !order.song_url)
```

`completed` is not in that allowed list, so the function returns a 404 "Song is not ready yet" even though the song file exists and is perfectly accessible. The status `completed` is used by the automation pipeline to mean "audio is generated and saved to storage" — but the song delivery flow transitions it to `delivered` after the email is sent. This order was manually converted from a lead (noting "webhook failure") and landed on `completed` without going through normal delivery.

**Fix:** Change the order status from `completed` → `delivered` in the database. This is the correct status for a song that has been sent to the customer.

**Also needed:** The `find_orders_by_short_id` RPC also filters on `status_filter: ["delivered", "ready"]` — so the status fix handles both the RPC lookup and the status check in one shot.

---

### Issue 2: Lyrics Are Missing

**Root cause:** When this lead was manually converted to an order, the `automation_lyrics` were never copied from the lead record to the order record. The lead (`AE7730B7`) has the full lyrics in its `automation_lyrics` column — a complete song including Intro, Verse 1, Chorus, Verse 2, Bridge, Final Chorus, and Outro. The order record has `automation_lyrics = null`.

**Fix:** Copy the `automation_lyrics` value from lead `ae7730b7-591a-4e50-9e0e-62a92626d136` directly into order `6ee72caa-cbef-4eb4-a657-21affac87bd8`.

---

### What Gets Fixed

| Problem | Before | After |
|---|---|---|
| Song page loads | "Song is not ready yet" (404) | Song plays correctly |
| Lyrics shown | "No lyrics yet" | Full song lyrics displayed |
| Admin panel | Status shows "Completed" | Status shows "Delivered" |

---

### Database Changes (Two SQL updates)

**Update 1:** Change order status to `delivered`

```sql
UPDATE orders
SET status = 'delivered'
WHERE id = '6ee72caa-cbef-4eb4-a657-21affac87bd8';
```

**Update 2:** Copy lyrics from lead to order

```sql
UPDATE orders
SET automation_lyrics = (
  SELECT automation_lyrics 
  FROM leads 
  WHERE id = 'ae7730b7-591a-4e50-9e0e-62a92626d136'
)
WHERE id = '6ee72caa-cbef-4eb4-a657-21affac87bd8';
```

Both are safe, targeted single-row updates with no side effects on other orders or the automation pipeline.

---

### No Code Changes Needed

This is purely a data fix for this specific order. The existing code is correct — `completed` is an intermediate pipeline status, `delivered` is the correct final status for a customer-accessible song page. The manual conversion just didn't set the right final status.

To prevent this from happening again for future manual conversions, the admin panel's manual conversion flow should default to setting `delivered` (not `completed`) when the lead already has a full song URL — but that's a separate improvement.
