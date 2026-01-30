

# Fix: Allow Scheduling for Current Day

## Problem
The calendar date picker is blocking selection of the current day because it compares calendar dates (which represent midnight) against `new Date()` (which includes the current time). This makes "today" appear to be in the past.

## Solution
Change the disabled check to compare against the **start of today** (midnight) instead of the current moment, so today remains selectable.

---

## Changes

### 1. Update Calendar disabled logic
**File:** `src/components/admin/ScheduledDeliveryPicker.tsx`

Change line 208 from:
```typescript
disabled={(date) => date < new Date()}
```

To:
```typescript
disabled={(date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}}
```

This sets `today` to midnight, so the current day will always be selectable.

---

## Why This Works
- `new Date()` = e.g., "Jan 30, 2026 3:35 PM"
- Calendar date = e.g., "Jan 30, 2026 12:00 AM" (midnight)
- Old logic: `midnight < 3:35 PM` → **true** → disabled ❌
- New logic: `midnight < midnight` → **false** → enabled ✓

The existing time validation in the `useEffect` (lines 114-118) already prevents selecting a past **time** on the current day — it only calls `onChange(pstDate)` if `pstDate > new Date()`. So users can pick today, and the validation will catch if they pick a time that's already passed.

---

## After This Fix
- You'll be able to select **today** in the calendar
- If you pick a time earlier than "right now," you'll see the amber warning: "⚠ Selected time is in the past"
- Only future times will successfully schedule

