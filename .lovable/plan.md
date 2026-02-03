
# Fix: Audio Generation Stuck State Detection and Recovery

## Root Cause Analysis

The audio generation gets stuck because **Kie.ai's webhook callback is unreliable**. Here's the current flow:

```text
1. automation-trigger → calls automation-generate-lyrics (sync)
2. automation-trigger → calls automation-generate-audio (sync)
3. automation-generate-audio → submits job to Kie.ai Suno API with callBackUrl
4. Lead status set to "audio_generating", taskId stored
5. **WAIT** for Kie.ai to POST to automation-suno-callback
6. automation-suno-callback → downloads audio, stores in storage, updates lead to "completed"
```

The problem: **Step 5 sometimes never happens.** The webhook from Kie.ai gets lost, times out, or fails silently. With no fallback, the lead sits in `audio_generating` forever.

---

## Solution Overview

### 1. Add "Stuck" Detection and Visual Indicators

Add a "STUCK" badge when audio generation exceeds 5 minutes, with tooltip explaining what's happening and when auto-recovery will run.

### 2. Add Manual "Recover Audio" Button

Let admins immediately poke the callback handler (just like the scheduled recovery does) instead of waiting 10+ minutes.

### 3. Improve the Automated Recovery

- Lower the threshold from 10 minutes to 5 minutes
- Process up to 3 stuck leads per run (instead of 1)
- Add better logging so admins can see recovery attempts in logs

---

## Technical Changes

### File 1: `src/components/admin/AutomationDashboard.tsx`

**Changes:**
- Add "isStuck" detection based on `automation_started_at` being >5 minutes ago while status is `audio_generating`
- Show a red "STUCK" badge with pulsing animation
- Add a "Recover Audio" button that calls a new `recover_audio` action

```typescript
// Add isStuck calculation to active jobs
const isStuck = job.status === "generating_audio" && 
  job.startedAt && 
  (Date.now() - new Date(job.startedAt).getTime()) > 5 * 60 * 1000;

// Show STUCK badge instead of normal spinner
{isStuck && (
  <Badge className="bg-red-500 animate-pulse gap-1">
    <AlertCircle className="h-3 w-3" />
    STUCK
  </Badge>
)}

// Add Recover button next to Cancel
{isStuck && (
  <Button onClick={() => handleRecoverAudio(job.id)}>
    <RotateCcw className="h-4 w-4 mr-1" />
    Recover
  </Button>
)}
```

### File 2: `src/components/admin/LeadsTable.tsx`

**Changes:**
- Add similar "STUCK" indicator in the automation badge helper
- Add elapsed time display when generating audio
- Show tooltip explaining: "Audio has been generating for X minutes. Recovery runs automatically or click Recover."

```typescript
// In getAutomationBadge function
case "audio_generating":
  const isStuck = lead.automation_started_at && 
    (Date.now() - new Date(lead.automation_started_at).getTime()) > 5 * 60 * 1000;
  if (isStuck) {
    return { label: "STUCK", className: "bg-red-100 text-red-800 animate-pulse", icon: AlertCircle, spin: false };
  }
  return { label: "Generating Audio...", className: "bg-purple-100 text-purple-800", icon: Loader2, spin: true };
```

### File 3: `supabase/functions/admin-orders/index.ts`

**Add new action:** `recover_audio`

```typescript
if (body?.action === "recover_audio") {
  const leadId = body.leadId;
  
  // Fetch lead to get taskId
  const { data: lead } = await supabase
    .from("leads")
    .select("id, automation_task_id, automation_status")
    .eq("id", leadId)
    .single();
    
  if (!lead?.automation_task_id || lead.automation_status !== "audio_generating") {
    return Response.json({ error: "Lead not in audio_generating state or missing taskId" });
  }
  
  // Re-invoke the callback handler (same as scheduled recovery)
  const recoveryResp = await fetch(
    `${supabaseUrl}/functions/v1/automation-suno-callback`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        taskId: lead.automation_task_id,
        data: { task_id: lead.automation_task_id },
      }),
    }
  );
  
  return Response.json({ success: true, status: recoveryResp.status });
}
```

### File 4: `supabase/functions/process-scheduled-deliveries/index.ts`

**Improve automated recovery:**
- Reduce threshold from 10 to 5 minutes
- Increase max recoveries per run from 1 to 3
- Add clearer logging

```typescript
const AUDIO_RECOVERY_AFTER_MINUTES = 5;  // Was 10
const MAX_AUDIO_RECOVERIES_PER_RUN = 3;  // Was 1
```

---

## UI Behavior After Implementation

| Status | Badge | Time | Actions Available |
|--------|-------|------|-------------------|
| Generating Audio (<5min) | Purple spinner | "Started 2m ago" | Cancel |
| Generating Audio (>5min) | Red "STUCK" pulse | "Started 8m ago" | Recover, Cancel |
| Failed | Red "Failed" | - | Retry |
| Completed | Green "AI Generated" | - | View Lyrics |

---

## Why This Fixes the Problem

1. **Root cause addressed**: The callback handler (`automation-suno-callback`) already works correctly - it fetches the task status directly from Kie.ai via `record-info` API. The issue is that it never gets called when the webhook fails.

2. **Manual recovery**: Admins can now immediately trigger the callback check instead of waiting.

3. **Faster auto-recovery**: 5-minute threshold + 3 per run means stuck leads are recovered within 2-7 minutes automatically.

4. **Visibility**: Clear "STUCK" badge makes it obvious when something needs attention.

---

## Testing Checklist

After implementation:
1. Trigger automation on a lead
2. Wait 5+ minutes without callback (or simulate by not setting up webhook)
3. Confirm "STUCK" badge appears in both Automation Dashboard and Leads table
4. Click "Recover" button
5. Confirm lead transitions to "completed" and song is available
