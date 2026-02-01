
# Lead Management Improvements

## Problem

When managing leads in the admin dashboard, you have two issues:
1. You can't easily see which leads you've already sent songs to - the visual indicators blend into the other information
2. You can't dismiss or archive leads that are tests or ones you don't need to deal with, so they clutter your list

## Solution

Add a "dismissed" status for leads and improve the visual feedback for sent songs.

---

## Changes Overview

### 1. Database: Add `dismissed_at` Column
Add a new nullable timestamp column to the `leads` table:
- `dismissed_at` (timestamp with time zone, nullable) - When set, the lead is considered dismissed/archived

### 2. Backend: Update admin-orders Edge Function
Add a new action to update lead dismissal status:
- `action: "dismiss_lead"` - Sets or clears the `dismissed_at` timestamp
- Works with the existing admin password authentication

### 3. Frontend: LeadsTable Component Updates

**New Filter Option:**
Add a filter to show/hide dismissed leads:
- "Show All" (default - excludes dismissed)
- "Show Dismissed Only"  
- "Show Everything" (includes dismissed)

**Visual Status Improvements on Lead Cards:**
Make sent status much more prominent:
- Green checkmark with "Song Sent" badge directly on the card when `preview_sent_at` is set
- Gray strikethrough styling for dismissed leads
- "Dismissed" badge for dismissed leads

**New Dismiss Button:**
Add a button on each lead card to mark as dismissed:
- "Dismiss" button for active leads (marks as dismissed)
- "Restore" button for dismissed leads (clears dismissal)

---

## Visual Changes

Before (current):
```text
+-------------------------------------------+
| John Smith                    [Unconverted]|
| Email: john@test.com                       |
| Song for: Jane (Wife)                      |
| [Upload Song]  [View Details]              |
+-------------------------------------------+
```

After (improved):
```text
+-------------------------------------------+
| John Smith           [Unconverted] [Q: 75] |
| Email: john@test.com                       |
| Song for: Jane (Wife)                      |
| Preview sent: Jan 30, 2026 3:45 PM PST     |   <-- Already shows
| [View Details]  [X Dismiss]                |   <-- New dismiss button
+-------------------------------------------+

When a lead has been sent a song, add prominent indicator:
+-------------------------------------------+
| John Smith    [Preview Sent] [SONG SENT]  |  <-- Prominent green badge
| ...                                        |
+-------------------------------------------+

Dismissed lead (if showing):
+-------------------------------------------+
| John Smith (Test)        [Dismissed]       |  <-- Gray/muted styling
| Email: test@test.com                       |
| [Restore]                                  |   
+-------------------------------------------+
```

---

## Technical Details

### Database Migration
```sql
ALTER TABLE leads 
ADD COLUMN dismissed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
```

### Edge Function Update
New action in `admin-orders/index.ts`:
```text
action: "update_lead_dismissal"
leadId: string
dismissed: boolean (true = dismiss, false = restore)
```

### UI Component Changes

**LeadsTable.tsx:**
- Add `dismissedFilter` state: "active" | "dismissed" | "all"
- Add filter to exclude dismissed leads by default
- Add dismiss/restore button on each card
- Add prominent "Song Sent" checkmark badge for leads with `preview_sent_at`
- Apply muted styling to dismissed leads

**Lead Interface:**
- Add `dismissed_at?: string | null` to the Lead type

---

## Files to Modify

| File | Change |
|------|--------|
| Database migration | Add `dismissed_at` column |
| `supabase/functions/admin-orders/index.ts` | Add `update_lead_dismissal` action |
| `src/components/admin/LeadsTable.tsx` | Add dismissal filter, dismiss button, enhanced status badges |
| `src/integrations/supabase/types.ts` | Auto-updated after migration |
