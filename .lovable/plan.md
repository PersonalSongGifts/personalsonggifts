
# Admin UI Enhancement Implementation Plan

## Overview

This plan implements the full admin visibility and control layer across 6 phases, with your two additional requests integrated:
1. Surface `automation_last_error` and `delivery_last_error` directly on Needs Attention rows
2. Persist `automation_audio_url_source` column and show it in Debug Info modal

---

## Phase 1: Database Schema Update

Add new column to track which audio URL field was used:

```sql
-- File: supabase/migrations/20260203_add_automation_audio_url_source.sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS automation_audio_url_source text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS automation_audio_url_source text;
```

---

## Phase 2: Update Callback Handler to Persist Audio URL Source

**File:** `supabase/functions/automation-suno-callback/index.ts`

Update both lead and order updates to include the new field:

For leads (around line 622):
```javascript
automation_audio_url_source: canonical.extractedFrom, // Track which URL field was used
```

For orders (around line 650):
```javascript
automation_audio_url_source: canonical.extractedFrom, // Track which URL field was used
```

---

## Phase 3: Add Backend Actions to admin-orders Edge Function

**File:** `supabase/functions/admin-orders/index.ts`

### 3.1 Reset Automation Action

Add after line ~795 (after `update_lead_fields`):

```javascript
// Reset automation (allows re-generation)
if (body?.action === "reset_automation") {
  const orderId = typeof body.orderId === "string" ? body.orderId : null;
  const leadId = typeof body.leadId === "string" ? body.leadId : null;
  const clearAssets = body.clearAssets === true; // For "Reset + Regenerate"
  
  if (!orderId && !leadId) {
    return new Response(
      JSON.stringify({ error: "Order ID or Lead ID required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const entityType = orderId ? "orders" : "leads";
  const entityId = orderId || leadId;

  // Base reset fields (always cleared)
  const updates: Record<string, unknown> = {
    automation_status: null,
    automation_task_id: null,
    automation_lyrics: null,
    automation_started_at: null,
    automation_retry_count: 0,
    automation_last_error: null,
    automation_raw_callback: null,
    automation_style_id: null,
    automation_audio_url_source: null,
    generated_at: null,
    inputs_hash: null,
    next_attempt_at: null,
    automation_manual_override_at: null, // Re-enable automation
  };

  // If clearAssets=true, also wipe the song
  if (clearAssets) {
    if (entityType === "orders") {
      updates.song_url = null;
      updates.song_title = null;
      updates.cover_image_url = null;
      updates.sent_at = null;
      updates.delivery_status = "pending";
      updates.status = "paid"; // Reset to paid status
    } else {
      updates.preview_song_url = null;
      updates.full_song_url = null;
      updates.song_title = null;
      updates.cover_image_url = null;
      updates.preview_sent_at = null;
      updates.preview_token = null;
      updates.status = "lead"; // Reset to initial status
    }
  }

  const { error: updateError } = await supabase
    .from(entityType)
    .update(updates)
    .eq("id", entityId);

  if (updateError) {
    console.error("Failed to reset automation:", updateError);
    throw updateError;
  }

  console.log(`[ADMIN] Automation reset for ${entityType} ${entityId}, clearAssets=${clearAssets}`);

  return new Response(
    JSON.stringify({ success: true, mode: clearAssets ? "full_reset" : "preserve_song" }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

### 3.2 Get Alerts Summary Action

Add after the reset_automation action:

```javascript
// Get alerts summary for dashboard banner
if (body?.action === "get_alerts_summary") {
  const now = new Date().toISOString();
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  // Stuck orders (audio_generating > 15 min)
  const { count: stuckOrders } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("automation_status", "audio_generating")
    .lt("automation_started_at", fifteenMinAgo)
    .is("dismissed_at", null);

  // Failed orders
  const { count: failedOrders } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("automation_status", ["failed", "permanently_failed"])
    .is("dismissed_at", null);

  // Overdue orders (completed but not sent, target_send_at passed)
  const { count: overdueOrders } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("automation_status", "completed")
    .lte("target_send_at", now)
    .is("sent_at", null)
    .is("dismissed_at", null);

  // Needs review orders (inputs changed or delivery issues)
  const { count: needsReviewOrders } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("delivery_status", "needs_review")
    .is("dismissed_at", null);

  // Delivery failed orders
  const { count: deliveryFailedOrders } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("delivery_status", "failed")
    .is("dismissed_at", null);

  // Stuck leads
  const { count: stuckLeads } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("automation_status", "audio_generating")
    .lt("automation_started_at", fifteenMinAgo)
    .is("dismissed_at", null);

  // Failed leads
  const { count: failedLeads } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .in("automation_status", ["failed", "permanently_failed"])
    .is("dismissed_at", null);

  // Overdue lead previews (song_ready but not sent, target_send_at passed)
  const { count: overdueLeads } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("status", "song_ready")
    .lte("target_send_at", now)
    .is("preview_sent_at", null)
    .is("dismissed_at", null);

  const alerts = {
    stuckOrders: stuckOrders || 0,
    failedOrders: failedOrders || 0,
    overdueOrders: overdueOrders || 0,
    needsReviewOrders: needsReviewOrders || 0,
    deliveryFailedOrders: deliveryFailedOrders || 0,
    stuckLeads: stuckLeads || 0,
    failedLeads: failedLeads || 0,
    overdueLeads: overdueLeads || 0,
  };

  const total = Object.values(alerts).reduce((sum, count) => sum + count, 0);

  return new Response(
    JSON.stringify({ alerts, total }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

---

## Phase 4: Update Admin.tsx - Order Interface and Enhanced Display

**File:** `src/pages/Admin.tsx`

### 4.1 Update Order Interface (lines 29-77)

Add new fields to the Order interface:

```typescript
interface Order {
  // ... existing fields ...
  
  // NEW: Timing fields for automation
  earliest_generate_at: string | null;
  target_send_at: string | null;
  generated_at: string | null;
  sent_at: string | null;
  next_attempt_at: string | null;
  
  // NEW: Delivery tracking
  delivery_status: string | null;
  delivery_last_error: string | null;
  delivery_retry_count: number | null;
  
  // NEW: Raw callback for debugging
  automation_raw_callback: unknown | null;
  
  // NEW: Audio URL source tracking
  automation_audio_url_source: string | null;
  
  // NEW: Input change detection
  inputs_hash: string | null;
}
```

### 4.2 Add "Needs Attention" Filter Option (around line 701)

Update the status filter Select:

```jsx
<Select value={statusFilter} onValueChange={setStatusFilter}>
  <SelectTrigger className="w-48">
    <SelectValue placeholder="Filter by status" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All Orders</SelectItem>
    <SelectItem value="needs_attention" className="text-red-600 font-medium">
      ⚠️ Needs Attention
    </SelectItem>
    <SelectItem value="paid">Paid</SelectItem>
    {/* ... rest of options ... */}
  </SelectContent>
</Select>
```

### 4.3 Add Needs Attention Filter Logic (around line 774)

Update the filter logic to include needs_attention:

```javascript
const filteredOrders = orders.filter((order) => {
  // First apply dismissed filter
  if (dismissedOrderFilter === "active" && order.dismissed_at) return false;
  if (dismissedOrderFilter === "cancelled" && !order.dismissed_at) return false;
  
  // NEW: Needs Attention filter
  if (statusFilter === "needs_attention") {
    const now = new Date();
    // Failed automation
    if (["failed", "permanently_failed", "rate_limited"].includes(order.automation_status || "")) return true;
    // Delivery issues
    if (["failed", "needs_review"].includes(order.delivery_status || "")) return true;
    // Overdue: completed but not sent and target_send_at passed
    if (order.automation_status === "completed" && 
        order.target_send_at && 
        new Date(order.target_send_at) <= now && 
        !order.sent_at) return true;
    return false;
  }
  
  // Standard status filter
  if (statusFilter && statusFilter !== "all") {
    return order.status === statusFilter;
  }
  
  // Search filter
  // ... existing search logic ...
});
```

### 4.4 Enhance Order Card Display (around line 820)

Add error display, delivery status, and retry count directly on cards:

```jsx
{/* Show delivery_status badge */}
{order.delivery_status && order.delivery_status !== "pending" && (
  <Badge 
    variant="outline" 
    className={
      order.delivery_status === "sent" ? "border-green-300 text-green-600" :
      order.delivery_status === "scheduled" ? "border-blue-300 text-blue-600" :
      order.delivery_status === "needs_review" ? "border-amber-300 text-amber-600" :
      order.delivery_status === "failed" ? "border-red-300 text-red-600" :
      "border-gray-300"
    }
  >
    <Mail className="h-3 w-3 mr-1" />
    {order.delivery_status}
  </Badge>
)}

{/* Retry count badge */}
{(order.automation_retry_count || 0) > 0 && (
  <Badge variant="outline" className="border-orange-300 text-orange-600">
    Retry #{order.automation_retry_count}
  </Badge>
)}

{/* Show last error directly on card if needs attention */}
{(order.automation_last_error || order.delivery_last_error) && (
  <div className="col-span-full mt-2 p-2 bg-red-50 rounded text-xs text-red-700 border border-red-200">
    <AlertCircle className="h-3 w-3 inline mr-1" />
    {order.automation_last_error || order.delivery_last_error}
  </div>
)}
```

### 4.5 Add Reset Automation Buttons in Order Detail Dialog

Add state variables:

```typescript
const [resettingAutomation, setResettingAutomation] = useState(false);
const [showResetConfirm, setShowResetConfirm] = useState<"soft" | "full" | null>(null);
const [regenerateConfirmText, setRegenerateConfirmText] = useState("");
const [showDebugInfo, setShowDebugInfo] = useState(false);
```

Add reset handler:

```typescript
const handleResetAutomation = async (clearAssets: boolean) => {
  if (!selectedOrder || !password) return;
  
  setResettingAutomation(true);
  try {
    const { data, error } = await supabase.functions.invoke("admin-orders", {
      method: "POST",
      body: {
        action: "reset_automation",
        orderId: selectedOrder.id,
        clearAssets,
        adminPassword: password,
      },
    });

    if (error) throw error;

    toast({
      title: clearAssets ? "Automation Reset + Assets Cleared" : "Automation Reset",
      description: clearAssets 
        ? "Song has been deleted. You can now edit inputs and regenerate."
        : "Automation state cleared. Existing song preserved.",
    });

    setShowResetConfirm(null);
    setRegenerateConfirmText("");
    fetchOrders();
  } catch (err) {
    console.error("Reset automation error:", err);
    toast({
      title: "Reset Failed",
      description: err instanceof Error ? err.message : "Unknown error",
      variant: "destructive",
    });
  } finally {
    setResettingAutomation(false);
  }
};
```

Add buttons in Order Detail Dialog (after Admin Notes section):

```jsx
{/* Automation Controls Section */}
{(selectedOrder.automation_status || selectedOrder.song_url) && (
  <div className="border-t pt-4">
    <h4 className="font-medium mb-3 flex items-center gap-2">
      <Bot className="h-4 w-4" />
      Automation Controls
    </h4>
    <div className="space-y-3">
      {/* Debug Info Button */}
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => setShowDebugInfo(true)}
        className="mr-2"
      >
        <Bug className="h-4 w-4 mr-2" />
        Debug Info
      </Button>

      {/* Reset Automation Button */}
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => setShowResetConfirm("soft")}
        disabled={resettingAutomation}
      >
        <RotateCcw className="h-4 w-4 mr-2" />
        Reset Automation
      </Button>

      {/* Reset + Regenerate Button (dangerous) */}
      {selectedOrder.song_url && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setShowResetConfirm("full")}
          disabled={resettingAutomation}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Reset + Regenerate
        </Button>
      )}
    </div>
  </div>
)}
```

### 4.6 Add Debug Info Dialog

```jsx
{/* Debug Info Dialog */}
<Dialog open={showDebugInfo} onOpenChange={setShowDebugInfo}>
  <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
    <DialogHeader>
      <DialogTitle>Debug Information</DialogTitle>
      <DialogDescription>
        Order {selectedOrder?.id.slice(0, 8).toUpperCase()} - Automation Details
      </DialogDescription>
    </DialogHeader>
    
    {selectedOrder && (
      <div className="space-y-4">
        {/* Automation Timeline */}
        <div>
          <h4 className="font-medium text-sm mb-2">Automation Timeline (UTC)</h4>
          <div className="text-xs font-mono bg-gray-50 p-3 rounded space-y-1">
            <p>earliest_generate_at: {selectedOrder.earliest_generate_at || "N/A"}</p>
            <p>automation_started_at: {selectedOrder.automation_started_at || "N/A"}</p>
            <p>generated_at: {selectedOrder.generated_at || "N/A"}</p>
            <p>target_send_at: {selectedOrder.target_send_at || "N/A"}</p>
            <p>sent_at: {selectedOrder.sent_at || "N/A"}</p>
          </div>
        </div>

        {/* Audio URL Source */}
        {selectedOrder.automation_audio_url_source && (
          <div>
            <h4 className="font-medium text-sm mb-2">Audio URL Extraction</h4>
            <Badge variant="outline" className="font-mono">
              Extracted from: {selectedOrder.automation_audio_url_source}
            </Badge>
          </div>
        )}

        {/* Generated Lyrics */}
        {selectedOrder.automation_lyrics && (
          <div>
            <h4 className="font-medium text-sm mb-2">Generated Lyrics</h4>
            <pre className="text-xs bg-gray-100 p-4 rounded overflow-auto max-h-48 whitespace-pre-wrap">
              {selectedOrder.automation_lyrics}
            </pre>
          </div>
        )}

        {/* Raw Callback Payload */}
        {selectedOrder.automation_raw_callback && (
          <div>
            <h4 className="font-medium text-sm mb-2">Raw Suno Callback</h4>
            <pre className="text-xs bg-gray-100 p-4 rounded overflow-auto max-h-64">
              {JSON.stringify(selectedOrder.automation_raw_callback, null, 2)}
            </pre>
          </div>
        )}

        {/* Last Error */}
        {(selectedOrder.automation_last_error || selectedOrder.delivery_last_error) && (
          <div>
            <h4 className="font-medium text-sm mb-2 text-red-600">Last Error</h4>
            <pre className="text-xs bg-red-50 p-4 rounded overflow-auto text-red-800">
              {selectedOrder.automation_last_error || selectedOrder.delivery_last_error}
            </pre>
          </div>
        )}
      </div>
    )}
  </DialogContent>
</Dialog>
```

### 4.7 Add Reset Confirmation Dialogs

```jsx
{/* Reset Automation Confirmation */}
<AlertDialog open={showResetConfirm === "soft"} onOpenChange={(open) => !open && setShowResetConfirm(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Reset Automation</AlertDialogTitle>
      <AlertDialogDescription>
        This will clear automation status and allow the order to be picked up for generation again.
        The existing song (if any) will be preserved.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={() => handleResetAutomation(false)} disabled={resettingAutomation}>
        {resettingAutomation ? "Resetting..." : "Reset Automation"}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>

{/* Reset + Regenerate Confirmation (Two-Step) */}
<AlertDialog open={showResetConfirm === "full"} onOpenChange={(open) => {
  if (!open) {
    setShowResetConfirm(null);
    setRegenerateConfirmText("");
  }
}}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle className="text-red-600">⚠️ Delete Song & Regenerate</AlertDialogTitle>
      <AlertDialogDescription className="space-y-3">
        <p>This will <strong>permanently delete</strong> the existing song and all generated assets.</p>
        <p>The order will return to "paid" status and can be edited before regeneration.</p>
        <p className="text-red-600 font-medium">This action cannot be undone.</p>
        <div className="mt-4">
          <Label>Type "REGENERATE" to confirm:</Label>
          <Input 
            value={regenerateConfirmText}
            onChange={(e) => setRegenerateConfirmText(e.target.value)}
            placeholder="REGENERATE"
            className="mt-2"
          />
        </div>
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction 
        onClick={() => handleResetAutomation(true)} 
        disabled={resettingAutomation || regenerateConfirmText !== "REGENERATE"}
        className="bg-red-600 hover:bg-red-700"
      >
        {resettingAutomation ? "Deleting..." : "Delete & Reset"}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Phase 5: Update AutomationDashboard.tsx - Alert Banner

**File:** `src/components/admin/AutomationDashboard.tsx`

### 5.1 Add Alert State and Fetch

```typescript
const [alerts, setAlerts] = useState<{
  stuckOrders: number;
  failedOrders: number;
  overdueOrders: number;
  needsReviewOrders: number;
  deliveryFailedOrders: number;
  stuckLeads: number;
  failedLeads: number;
  overdueLeads: number;
} | null>(null);
const [alertsTotal, setAlertsTotal] = useState(0);

const fetchAlerts = async () => {
  try {
    const { data, error } = await supabase.functions.invoke("admin-orders", {
      method: "POST",
      body: {
        action: "get_alerts_summary",
        adminPassword,
      },
    });

    if (error) throw error;
    setAlerts(data.alerts);
    setAlertsTotal(data.total);
  } catch (err) {
    console.error("Failed to fetch alerts:", err);
  }
};

useEffect(() => {
  fetchAlerts();
}, [adminPassword]);
```

### 5.2 Add Alert Banner Component (at top of return)

```jsx
{/* Alert Banner */}
{alertsTotal > 0 && (
  <Card className="border-red-300 bg-red-50">
    <CardContent className="py-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-red-800">
            {alertsTotal} item{alertsTotal !== 1 ? "s" : ""} need attention
          </p>
          <ul className="text-sm text-red-700 mt-1 space-y-0.5">
            {alerts?.stuckOrders > 0 && <li>• {alerts.stuckOrders} order(s) stuck in audio generation</li>}
            {alerts?.overdueOrders > 0 && <li>• {alerts.overdueOrders} order(s) overdue for delivery</li>}
            {alerts?.failedOrders > 0 && <li>• {alerts.failedOrders} order(s) failed</li>}
            {alerts?.needsReviewOrders > 0 && <li>• {alerts.needsReviewOrders} order(s) need review (inputs changed)</li>}
            {alerts?.deliveryFailedOrders > 0 && <li>• {alerts.deliveryFailedOrders} order(s) delivery failed</li>}
            {alerts?.stuckLeads > 0 && <li>• {alerts.stuckLeads} lead(s) stuck in audio generation</li>}
            {alerts?.overdueLeads > 0 && <li>• {alerts.overdueLeads} lead(s) overdue for preview</li>}
            {alerts?.failedLeads > 0 && <li>• {alerts.failedLeads} lead(s) failed</li>}
          </ul>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => {
            // This would need to be passed up to Admin.tsx to switch tabs and set filter
            // For now, just refresh
            onRefresh?.();
          }}
          className="border-red-300 text-red-600 hover:bg-red-100"
        >
          Refresh
        </Button>
      </div>
    </CardContent>
  </Card>
)}
```

---

## Phase 6: Update LeadsTable.tsx - Needs Attention Filter + Reset

**File:** `src/components/admin/LeadsTable.tsx`

### 6.1 Update Lead Interface

Add new fields:

```typescript
export interface Lead {
  // ... existing fields ...
  
  // NEW: Timing fields
  earliest_generate_at?: string | null;
  target_send_at?: string | null;
  generated_at?: string | null;
  sent_at?: string | null;
  next_attempt_at?: string | null;
  
  // NEW: Raw callback and audio source
  automation_raw_callback?: unknown | null;
  automation_audio_url_source?: string | null;
}
```

### 6.2 Add Needs Attention Filter

Add to the status filter options and filter logic similar to Orders.

### 6.3 Add Reset Automation Handler and Buttons

Similar pattern to Orders - add reset handler and buttons to lead detail dialog.

---

## Files to Modify Summary

| File | Changes |
|------|---------|
| `supabase/migrations/...` | Add `automation_audio_url_source` column |
| `supabase/functions/automation-suno-callback/index.ts` | Persist `automation_audio_url_source` from canonical.extractedFrom |
| `supabase/functions/admin-orders/index.ts` | Add `reset_automation` and `get_alerts_summary` actions |
| `src/pages/Admin.tsx` | Update Order interface, add Needs Attention filter, add error display on cards, add Debug Info dialog, add Reset buttons with confirmations |
| `src/components/admin/AutomationDashboard.tsx` | Add alert banner with counts |
| `src/components/admin/LeadsTable.tsx` | Update Lead interface, add Needs Attention filter, add Debug Info + Reset buttons |

---

## Your Requests Integrated

1. **Error visibility on cards**: `automation_last_error` and `delivery_last_error` displayed directly in a red box on Needs Attention order cards
2. **Audio URL source tracking**: New `automation_audio_url_source` column persisted from callback normalization and shown in Debug Info modal

---

## Implementation Order

1. Database migration for `automation_audio_url_source`
2. Update `automation-suno-callback` to persist the field
3. Add backend actions (`reset_automation`, `get_alerts_summary`)
4. Update Admin.tsx (Order interface, filter, cards, dialogs)
5. Update AutomationDashboard.tsx (alert banner)
6. Update LeadsTable.tsx (Lead interface, filter, reset buttons)
