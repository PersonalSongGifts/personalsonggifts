

# Plan: Add Full Traffic Source Information to Order & Lead Details

## What You're Getting

Each order and lead will show exactly where the customer came from - including the complete UTM tracking breakdown in the detail dialogs.

## Current State
- **Cards show source badge**: `facebook / cpc` (already implemented)
- **Dialogs don't show source details**: Missing the full campaign, content, and term information

## Changes to Make

### 1. Add Source Section to Order Details Dialog
In the Order Details dialog (`Admin.tsx`), add a new "Traffic Source" section after the Customer/Recipient info showing:
- Source (e.g., facebook)
- Medium (e.g., cpc)
- Campaign (e.g., valentines2026)
- Content (if set)
- Term (if set)

Will display "Direct" if no UTM data exists.

### 2. Add Source Section to Lead Details Dialog
In the Lead Details dialog (`LeadsTable.tsx`), add a similar "Traffic Source" section showing the same UTM breakdown.

### 3. Display Format
Both will show as a clean grid like:
```
Traffic Source
Source: facebook    Medium: cpc
Campaign: valentines2026
Content: ad_variant_a    Term: personalized gifts
```

If no UTM data exists, it will show:
```
Traffic Source: Direct (no tracking data)
```

---

## Technical Changes

### File: `src/pages/Admin.tsx`
**Add after line 633 (after Recipient section):**
```tsx
{/* Traffic Source Section */}
<div className="col-span-2">
  <h4 className="font-medium text-sm text-muted-foreground mb-1">Traffic Source</h4>
  {selectedOrder.utm_source ? (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div><span className="text-muted-foreground">Source:</span> {selectedOrder.utm_source}</div>
      {selectedOrder.utm_medium && (
        <div><span className="text-muted-foreground">Medium:</span> {selectedOrder.utm_medium}</div>
      )}
      {selectedOrder.utm_campaign && (
        <div className="col-span-2"><span className="text-muted-foreground">Campaign:</span> {selectedOrder.utm_campaign}</div>
      )}
      {selectedOrder.utm_content && (
        <div><span className="text-muted-foreground">Content:</span> {selectedOrder.utm_content}</div>
      )}
      {selectedOrder.utm_term && (
        <div><span className="text-muted-foreground">Term:</span> {selectedOrder.utm_term}</div>
      )}
    </div>
  ) : (
    <p className="text-sm text-muted-foreground italic">Direct (no tracking data)</p>
  )}
</div>
```

### File: `src/components/admin/LeadsTable.tsx`
**Add to the details grid section (around line 1200, after the engagement tracking section):**
```tsx
{/* Traffic Source Section */}
<div className="col-span-2 border-t pt-3 mt-2">
  <h4 className="font-medium text-sm mb-2">Traffic Source</h4>
  {selectedLead.utm_source ? (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div><span className="text-muted-foreground">Source:</span> {selectedLead.utm_source}</div>
      {selectedLead.utm_medium && (
        <div><span className="text-muted-foreground">Medium:</span> {selectedLead.utm_medium}</div>
      )}
      {selectedLead.utm_campaign && (
        <div className="col-span-2"><span className="text-muted-foreground">Campaign:</span> {selectedLead.utm_campaign}</div>
      )}
      {selectedLead.utm_content && (
        <div><span className="text-muted-foreground">Content:</span> {selectedLead.utm_content}</div>
      )}
      {selectedLead.utm_term && (
        <div><span className="text-muted-foreground">Term:</span> {selectedLead.utm_term}</div>
      )}
    </div>
  ) : (
    <p className="text-sm text-muted-foreground italic">Direct (no tracking data)</p>
  )}
</div>
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Admin.tsx` | Add Traffic Source section to Order Details dialog |
| `src/components/admin/LeadsTable.tsx` | Add Traffic Source section to Lead Details dialog |

## Result
After these changes:
- Each order's detail dialog will show complete source info
- Each lead's detail dialog will show complete source info  
- You'll know exactly where every customer came from
- Works alongside the existing source badges on cards

