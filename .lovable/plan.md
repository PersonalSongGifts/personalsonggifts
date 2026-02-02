

# Plan: Improve Date/Time Readability in Admin Panel (PST Format)

## Overview
Make all date and time displays in the admin panel more human-readable while maintaining the PST timezone standard. This is a display-only change and will **not** affect any backend logic for sending emails or processing deliveries.

## Current State
The admin panel currently displays dates using:
1. `toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) + " PST"` - which produces output like `2/2/2026, 3:17:33 PM PST`
2. Some places use `toLocaleString()` without timezone - inconsistent
3. The ReactionsTable uses a custom `formatDate` function but doesn't include timezone

The format works but could be more scannable with a cleaner, more consistent format across all date displays.

## Proposed Format
Change all dates to a more readable format:
- **Before:** `2/2/2026, 3:17:33 PM PST`
- **After:** `Sun, Feb 2 at 3:17 PM PST`

This format is:
- More scannable (day of week helps admins plan)
- Cleaner (no seconds, uses abbreviated month)
- Consistent timezone display

## Technical Approach

### Step 1: Create a Shared Date Formatting Utility
Create a new utility function in `src/lib/utils.ts` that all admin components can use:

```typescript
// Format date for admin display in PST
export function formatAdminDate(dateString: string | Date): string {
  const date = typeof dateString === "string" ? new Date(dateString) : dateString;
  return date.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short", 
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " PST";
}

// Shorter format for inline/compact displays (no weekday)
export function formatAdminDateShort(dateString: string | Date): string {
  const date = typeof dateString === "string" ? new Date(dateString) : dateString;
  return date.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric", 
    minute: "2-digit",
    hour12: true,
  }) + " PST";
}
```

### Step 2: Update Admin.tsx (Orders Tab)
Replace all inline date formatting with the utility function.

**Locations to update:**
- Line 516: Order Date/Time in order cards
- Line 521: Expected Delivery in order cards  
- Line 527: Scheduled Send in order cards
- Line 766: Delivered date in dialog
- Line 774: Song Played date in dialog
- Line 789: Downloaded date in dialog

### Step 3: Update LeadsTable.tsx
Replace all inline date formatting with the utility function.

**Locations to update:**
- Line 658: Captured date in lead cards
- Line 663: Preview sent date in lead cards
- Line 669: Follow-up sent date in lead cards
- Line 686: Converted date in lead cards
- Line 693: Dismissed date in lead cards
- Line 981: Scheduled auto-send date in dialog
- Line 996: Preview sent date in dialog
- Lines 1148, 1153, 1159, 1165, 1171, 1184: Various dates in dialog grid

### Step 4: Update ReactionsTable.tsx
Update the existing `formatDate` function to include PST timezone.

**Location:**
- Lines 46-54: Replace formatDate function to use PST

### Step 5: Update ScheduledDeliveryPicker.tsx
The `formatPST` function already exists and produces a good format. No changes needed here.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/utils.ts` | Add `formatAdminDate` and `formatAdminDateShort` functions |
| `src/pages/Admin.tsx` | Import and use new formatting functions (6 locations) |
| `src/components/admin/LeadsTable.tsx` | Import and use new formatting functions (~12 locations) |
| `src/components/admin/ReactionsTable.tsx` | Update `formatDate` function to use PST |

## Safety Guarantee
- **No backend changes** - all date logic in edge functions remains untouched
- **Display only** - these are purely UI formatting changes
- **Timezone preserved** - all dates will continue to display in PST as required
- **Backend dates stored as UTC** - nothing changes in how dates are stored or compared

