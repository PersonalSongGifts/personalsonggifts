
# AI Automation Control Panel

## What You'll Get

A dedicated control center in the Admin dashboard to manage AI song generation with:

1. **Global Start/Stop Toggle** - Pause or resume all automated song generation
2. **Queue Dashboard** - See all leads currently being processed by AI
3. **Progress Tracking** - Real-time status of each lead in the pipeline
4. **Manual Controls** - Trigger, pause, or retry automation for specific leads
5. **Settings Panel** - Adjust quality threshold and other automation parameters

---

## New "Automation" Tab in Admin Dashboard

```text
+------------------------------------------------------------------+
| Analytics | Orders | Reactions | Leads | Emails | AUTOMATION     |
+------------------------------------------------------------------+

┌─────────────────────────────────────────────────────────────────┐
│ AI Song Generation                                              │
│                                                                 │
│ ┌───────────────────────┐  ┌──────────────────────────────────┐│
│ │ AUTOMATION STATUS     │  │ Quick Stats                      ││
│ │                       │  │                                  ││
│ │   [====] RUNNING      │  │  In Queue: 3                     ││
│ │                       │  │  Generating Lyrics: 1            ││
│ │ Quality Threshold: 65 │  │  Generating Audio: 2             ││
│ │ [  -  ] [65] [  +  ]  │  │  Completed Today: 12             ││
│ │                       │  │  Failed: 1                       ││
│ └───────────────────────┘  └──────────────────────────────────┘│
│                                                                 │
│ ┌───────────────────────────────────────────────────────────────┐
│ │ Active Jobs                                           [Refresh]│
│ ├───────────────────────────────────────────────────────────────┤
│ │ Lead           Status              Started      Actions       │
│ ├───────────────────────────────────────────────────────────────┤
│ │ Crystal        [●] Generating      2 min ago    [Pause][View] │
│ │                Audio...                                       │
│ │ Jordan         [●] Lyrics Ready    5 min ago    [Cancel]      │
│ │ Mark           [✓] Completed       10 min ago   [View Song]   │
│ │ Bianca         [✗] Failed          15 min ago   [Retry][View] │
│ │                "Suno API timeout"                             │
│ └───────────────────────────────────────────────────────────────┘
│                                                                 │
│ ┌───────────────────────────────────────────────────────────────┐
│ │ Eligible Leads (Quality >= 65, No Song)              [Run All]│
│ ├───────────────────────────────────────────────────────────────┤
│ │ [ ] Crystal (Score: 80) - Valentine's Day, Pop               │
│ │ [ ] Reggie (Score: 80) - Birthday, Country                   │
│ │ [ ] Shakiethia (Score: 75) - Anniversary, R&B                │
│ │ [ ] Mark (Score: 75) - Mother's Day, Acoustic                │
│ │                                                               │
│ │ Selected: 0        [Generate Selected]                        │
│ └───────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

---

## Features Breakdown

### 1. Global Automation Toggle

- **ON/OFF switch** stored in `admin_settings` table
- When OFF, `capture-lead` function skips auto-triggering
- When OFF, manual triggers still work
- Visual indicator shows current state

### 2. Active Jobs Panel

Shows leads currently in the automation pipeline:
- Status badges with progress indicators
- Time since job started
- View lyrics (if generated)
- Cancel/retry options
- Error messages for failed jobs

### 3. Eligible Leads Queue

Lists leads that qualify for automation but haven't been processed:
- Multi-select checkboxes
- "Generate Selected" to batch trigger
- "Run All Eligible" for bulk processing
- Filter by quality score

### 4. Settings Panel

- Quality threshold slider (0-100)
- Save changes in real-time

---

## Database Changes

Add one new setting to `admin_settings`:

| Key | Default Value | Description |
|-----|---------------|-------------|
| `automation_enabled` | `true` | Global on/off for auto-triggering |

---

## Edge Function Updates

### `capture-lead/index.ts`

Add check before auto-triggering:

```typescript
// Check if automation is globally enabled
const { data: enabledSetting } = await supabase
  .from("admin_settings")
  .select("value")
  .eq("key", "automation_enabled")
  .single();

const automationEnabled = enabledSetting?.value !== "false";

if (!automationEnabled) {
  console.log("Automation disabled globally, skipping auto-trigger");
  return;
}
```

### `admin-orders/index.ts`

Add new actions:
- `get_automation_status` - Returns queue stats and active jobs
- `batch_trigger_automation` - Triggers automation for multiple leads
- `cancel_automation` - Cancels a running automation job

---

## Frontend Components

### New File: `src/components/admin/AutomationDashboard.tsx`

Contains:
- `AutomationToggle` - Global on/off switch
- `ActiveJobsTable` - Shows leads in pipeline
- `EligibleLeadsQueue` - Shows leads ready for automation
- `AutomationSettings` - Quality threshold control

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/components/admin/AutomationDashboard.tsx` | **New** - Main automation control component |
| `src/pages/Admin.tsx` | Add "Automation" tab |
| `supabase/functions/admin-orders/index.ts` | Add automation management actions |
| `supabase/functions/capture-lead/index.ts` | Check `automation_enabled` before auto-trigger |
| `admin_settings` table | Add `automation_enabled` setting (via edge function) |

---

## Technical Implementation

### Automation Status Endpoint

```typescript
// GET /admin-orders with action: "get_automation_status"
Response: {
  enabled: true,
  qualityThreshold: 65,
  stats: {
    pending: 1,
    lyricsGenerating: 0,
    audioGenerating: 2,
    completedToday: 12,
    failedToday: 1
  },
  activeJobs: [
    { leadId, recipientName, status, startedAt, error },
    ...
  ],
  eligibleLeads: [
    { id, recipientName, qualityScore, genre, occasion },
    ...
  ]
}
```

### Batch Trigger

```typescript
// POST /admin-orders with action: "batch_trigger_automation"
Body: { leadIds: ["uuid1", "uuid2", ...] }
Response: {
  triggered: 3,
  skipped: 1,
  errors: [{ leadId, error }]
}
```

---

## How It Works

1. **New lead comes in** via `capture-lead`
2. Function checks if `automation_enabled` = true
3. If enabled AND quality >= threshold, triggers `automation-trigger`
4. Lead appears in "Active Jobs" panel
5. Admin can monitor progress, retry failures, or manually trigger more

---

## Success Criteria

- Toggle turns automation on/off globally
- Active jobs show real-time status
- Eligible leads can be batch-triggered
- Quality threshold is adjustable
- Failed jobs show error details and retry option
