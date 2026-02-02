
# Plan: Improve Recommended Delivery Time Logic

## The Issue
The "Recommended" delivery timing option disappears when the calculated recommended time (12 hours before expected delivery) has already passed. This is technically correct but confusing for admins who are uploading songs close to or after the recommended window.

## Why It's Happening
For the order you're looking at (Eugene Pennewell):
- Expected delivery: Feb 3, 2026 at 5:47 AM UTC
- Recommended time would be: Feb 2, 2026 at 5:47 PM UTC
- Current time: Feb 2, 2026 at ~11:00 PM UTC

Since the recommended time (5:47 PM) has passed, the system hides the option because scheduling a delivery for a past time makes no sense.

## Proposed Solution
Instead of hiding the "Recommended" option entirely, show a smart fallback:

1. **If 12 hours before expected delivery is still in the future** - Show that as "Recommended"
2. **If that time has passed but expected delivery is still in the future** - Show a fallback recommendation (e.g., "ASAP" or "1 hour from now") as "Suggested"
3. **If expected delivery itself has passed** - Show "Overdue" warning and suggest sending immediately

## Technical Changes

### File: `src/components/admin/ScheduledDeliveryPicker.tsx`

Update `getRecommendedTime` function to return a fallback when the ideal recommended time has passed:

```text
Current logic:
- Returns: 12hr before expected delivery
- Returns null if that time is past

New logic:
- If 12hr before expected is future: return that (label: "Recommended - 12hr before delivery")
- If 12hr before is past but expected is future: return 30min from now (label: "Suggested - Delivery due soon")
- If expected is past: return now + 5min (label: "Overdue - Send immediately")
```

The UI will show appropriate context for each scenario:
- "Recommended" with sparkle icon for optimal timing
- "Suggested" with clock icon when running late
- "Overdue" with warning icon when past expected delivery

This ensures admins always have a one-click scheduling option while understanding the timing context.
