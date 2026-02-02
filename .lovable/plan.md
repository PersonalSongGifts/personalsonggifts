

# Engagement Tracking & Lead Conversion Visibility

## Summary

Add tracking for when leads and customers play/download songs, and improve the visual display of converted leads in the admin panel.

---

## Part 1: Database Schema Updates

Add new tracking columns to both tables:

**leads table:**
| Column | Type | Purpose |
|--------|------|---------|
| `preview_played_at` | timestamp | First time lead played the 45-second preview |
| `preview_play_count` | integer | Total times preview was played |

**orders table:**
| Column | Type | Purpose |
|--------|------|---------|
| `song_played_at` | timestamp | First time customer played the full song |
| `song_play_count` | integer | Total times song was played |
| `song_downloaded_at` | timestamp | First time customer downloaded the song |
| `song_download_count` | integer | Total times song was downloaded |

---

## Part 2: Backend Tracking Endpoints

### New Edge Function: `track-song-engagement`

Creates a new endpoint that the frontend can call to log play/download events.

```
POST /functions/v1/track-song-engagement
{
  "type": "lead" | "order",
  "action": "play" | "download",
  "token": "preview-token" (for leads),
  "orderId": "uuid" (for orders)
}
```

The function will:
1. Validate the token/orderId
2. Update `*_played_at` or `*_downloaded_at` (only on first occurrence)
3. Increment the count each time

---

## Part 3: Frontend Tracking Calls

### SongPreview.tsx (Lead Preview Page)

Add tracking when user clicks play:
```typescript
const togglePlayback = async () => {
  if (!audioRef.current) return;
  
  if (!isPlaying) {
    // Track play event
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-song-engagement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "lead", action: "play", token }),
    });
  }
  // ... existing play logic
};
```

### SongPlayer.tsx (Customer Song Page)

Add tracking for play and download:
```typescript
// On play
const togglePlay = () => {
  if (!isPlaying) {
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-song-engagement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "order", action: "play", orderId }),
    });
  }
  // ...
};

// On download
const downloadSong = async () => {
  fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-song-engagement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "order", action: "download", orderId }),
  });
  // ... existing download logic
};
```

---

## Part 4: Admin Panel Enhancements

### LeadsTable.tsx - Better Converted Lead Visibility

Add a prominent "CONVERTED" visual treatment:
- Green highlight row for converted leads
- Badge with checkmark icon and conversion date
- Show the order ID it converted to (clickable link)
- Separate section or filter for "Converted" leads

```typescript
// Row styling for converted leads
<Card className={`${lead.status === "converted" ? "border-2 border-green-500 bg-green-50/30" : ""}`}>
```

Add engagement indicators in lead cards:
```typescript
{lead.preview_played_at && (
  <Badge variant="outline" className="text-green-600 border-green-300">
    <Play className="h-3 w-3 mr-1" />
    Played {lead.preview_play_count}x
  </Badge>
)}
```

### StatsCards.tsx - New Engagement Stats

Add cards for:
- **Previews Played**: Count of leads who actually played the song
- **Conversion Rate**: % of leads who played preview and then converted
- **Songs Played**: Count of delivered orders where customer played the song
- **Downloads**: Count of songs downloaded

### Lead Details Dialog

Show engagement timeline:
```text
Timeline:
- Captured: Jan 15, 2:30 PM
- Preview Sent: Jan 16, 10:00 AM
- Preview Opened: Jan 16, 2:15 PM
- Preview Played: Jan 16, 2:16 PM (3 times)
- Converted: Jan 16, 2:20 PM -> Order #ABC123
```

### Order Details Dialog

Show customer engagement:
```text
Engagement:
- Delivered: Jan 17, 9:00 AM
- Song Played: Jan 17, 9:05 AM (5 times)
- Downloaded: Jan 17, 9:10 AM (2 times)
```

---

## Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| Database migration | CREATE | Add tracking columns to leads and orders |
| `supabase/functions/track-song-engagement/index.ts` | CREATE | New edge function for tracking |
| `src/pages/SongPreview.tsx` | MODIFY | Add play tracking call |
| `src/pages/SongPlayer.tsx` | MODIFY | Add play/download tracking calls |
| `src/components/admin/LeadsTable.tsx` | MODIFY | Enhanced converted lead display, engagement badges |
| `src/components/admin/StatsCards.tsx` | MODIFY | Add engagement statistics |
| `src/pages/Admin.tsx` | MODIFY | Show engagement data in order details |
| `supabase/functions/admin-orders/index.ts` | MODIFY | Return new tracking fields |
| `src/integrations/supabase/types.ts` | AUTO-UPDATE | New columns added automatically |

---

## Visual Mockups

### Converted Lead Card

```text
+--------------------------------------------------------------+
| [GREEN BORDER]                                               |
| CONVERTED ✓                                                  |
|                                                              |
| John Doe                                     Score: 85       |
| john@email.com                              [CONVERTED]      |
|                                                              |
| Song for: Mom (Mother)                                       |
| Occasion: Mother's Day • Pop                                 |
|                                                              |
| Engagement: [Played 3x] [Opened 2x]                         |
|                                                              |
| Converted to Order #A1B2C3D4 on Jan 16, 2026                |
+--------------------------------------------------------------+
```

### Lead Engagement in Analytics

```text
+------------------+  +------------------+  +------------------+
| Previews Played  |  | Play → Convert   |  | Songs Downloaded |
|       24         |  |      38%         |  |        18        |
| 24 of 45 leads   |  | of played leads  |  | of 28 delivered  |
+------------------+  +------------------+  +------------------+
```

---

## Technical Notes

1. **Rate limiting**: The tracking endpoint will use client IP + token to prevent abuse (don't count rapid-fire plays)
2. **Async tracking**: Tracking calls are fire-and-forget (don't block playback)
3. **First-play timestamp**: Only the first play sets `preview_played_at`; subsequent plays just increment count
4. **Privacy**: No additional PII is collected - just timestamps and counts

