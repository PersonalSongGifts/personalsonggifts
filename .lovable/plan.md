
# Stuck Lead Auto-Recovery & Admin Visibility Enhancement

## What Happened with Maya Golan's Lead

The lead was stuck in `audio_generating` status because Kie.ai's webhook callback didn't reach our system. However, the **automated recovery already worked**:

1. At 00:26:52 UTC - Audio generation started
2. At 00:32:01 UTC - The cron job detected it was stuck (>5 min) and re-invoked the callback
3. At 00:32:05 UTC - The callback completed successfully, song was downloaded and uploaded
4. Current status is `completed` with the song ready

The system is working correctly for auto-recovery. What's missing is **visibility for admins** about what's happening.

---

## Implementation Plan

### Phase 1: Enhanced Stuck Badge with Tooltip

**File:** `src/components/admin/LeadsTable.tsx`

Add hover tooltip to the STUCK badge showing:
- Why it's stuck (webhook callback not received)
- What the system will do (auto-retry every minute)
- When next retry is expected

Changes:
1. Import `Tooltip, TooltipTrigger, TooltipContent` from tooltip component
2. Update `getAutomationBadge` to return tooltip message
3. Wrap the STUCK badge in a Tooltip component

```typescript
// Update the badge rendering (around line 936-946)
{!lead.dismissed_at && (() => {
  const automationBadge = getAutomationBadge(lead);
  if (!automationBadge) return null;
  const IconComponent = automationBadge.icon;
  
  // For stuck items, wrap in tooltip
  if (automationBadge.isStuck) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={automationBadge.className}>
            {IconComponent && <IconComponent className="h-3 w-3 mr-1" />}
            {automationBadge.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="font-semibold">Audio Provider Callback Delayed</p>
          <p className="text-xs mt-1">The audio provider hasn't responded yet.</p>
          <p className="text-xs mt-1 text-green-600">System will auto-retry every minute.</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return (
    <Badge className={automationBadge.className}>
      {IconComponent && <IconComponent className={`h-3 w-3 mr-1 ${automationBadge.spin ? 'animate-spin' : ''}`} />}
      {automationBadge.label}
    </Badge>
  );
})()}
```

---

### Phase 2: Enhanced Stuck Badge in AutomationDashboard

**File:** `src/components/admin/AutomationDashboard.tsx`

Add the same tooltip to the STUCK badge in the Active Jobs section:

```typescript
// Update getStatusBadge function (around line 419-429)
if (job && isJobStuck(job)) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className="gap-1 bg-red-500 animate-pulse cursor-help">
          <AlertCircle className="h-3 w-3" />
          STUCK ({elapsedMin}m)
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-semibold">Audio Provider Callback Delayed</p>
        <p className="text-xs mt-1">Kie.ai hasn't sent the completion webhook.</p>
        <p className="text-xs mt-1 text-green-600">System auto-retries every minute. Click "Recover Audio" to retry now.</p>
      </TooltipContent>
    </Tooltip>
  );
}
```

---

### Phase 3: Show Error Reason in Lead Details Dialog

**File:** `src/components/admin/LeadsTable.tsx`

When viewing a stuck lead's details, show:
- Current automation status
- Last error (if any)
- Time since generation started
- System action (auto-retry explanation)

Add a section in the lead detail dialog (after automation status info):

```typescript
{/* Automation Status Section */}
{selectedLead.automation_status && (
  <div className="border-t pt-4 mt-4">
    <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
      <Bot className="h-4 w-4" />
      Automation Status
    </h4>
    <div className="text-sm space-y-2">
      <p><strong>Status:</strong> {selectedLead.automation_status}</p>
      {selectedLead.automation_started_at && (
        <p><strong>Started:</strong> {formatAdminDate(selectedLead.automation_started_at)}</p>
      )}
      {selectedLead.automation_last_error && (
        <p className="text-red-600"><strong>Last Error:</strong> {selectedLead.automation_last_error}</p>
      )}
      
      {/* Stuck explanation */}
      {selectedLead.automation_status === "audio_generating" && 
       selectedLead.automation_started_at &&
       (Date.now() - new Date(selectedLead.automation_started_at).getTime()) > 5 * 60 * 1000 && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3 mt-2">
          <p className="font-medium text-amber-800">Why is this stuck?</p>
          <p className="text-xs text-amber-700 mt-1">
            The audio provider (Kie.ai) hasn't sent the completion callback yet.
            This can happen if their webhook delivery fails.
          </p>
          <p className="text-xs text-green-700 mt-2 font-medium">
            What the system will do: Auto-retry every minute by polling the provider for status.
          </p>
        </div>
      )}
    </div>
  </div>
)}
```

---

### Phase 4: Add Same Visibility to Orders

**File:** `src/pages/Admin.tsx`

Apply the same tooltip pattern to stuck orders in the Orders tab.

---

## Technical Details

| File | Changes |
|------|---------|
| `src/components/admin/LeadsTable.tsx` | Import Tooltip, wrap STUCK badge, add automation status section in details dialog |
| `src/components/admin/AutomationDashboard.tsx` | Import Tooltip, wrap STUCK badge in Active Jobs section |
| `src/pages/Admin.tsx` | Add tooltip to stuck order badges |

---

## User Experience Summary

1. **Hover over STUCK badge** - See explanation of why it's stuck and what the system will do
2. **View Details** - See full automation status section with error details and recovery explanation
3. **Manual Recovery** - Existing "Recover Audio" button still available for immediate retry
4. **Automatic Recovery** - System continues to auto-retry every minute (already working)

