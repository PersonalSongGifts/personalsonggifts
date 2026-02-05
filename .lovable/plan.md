

# Update Stats Cards for True Lead Recovery Metrics

## Summary

Replace the current "Lead Conversions" card (which includes same-session conversions) with **true lead recovery metrics** - only counting orders where a preview was actually sent to the lead before purchase.

---

## Current State

The `StatsCards` component currently shows:
- **Lead Conversions**: Uses `orders.filter(o => o.source === "lead_conversion")` 
- This includes ~100 orders where the user simply completed checkout in the same session

**What we actually want to track:**
- True recoveries: leads who received a preview email (`preview_sent_at` is set) AND then converted

---

## Solution

### Update Lead Interface

Add `preview_sent_at` to the Lead interface in StatsCards to enable filtering:

```typescript
interface Lead {
  id: string;
  status: string;
  captured_at: string;
  preview_played_at?: string | null;
  preview_play_count?: number | null;
  preview_sent_at?: string | null;  // NEW
  order_id?: string | null;          // NEW - to link to orders
}
```

### Calculate True Recovery Metrics

```typescript
// Leads who received a preview email
const previewsSent = leads.filter((l) => l.preview_sent_at).length;

// True recoveries: preview was sent AND lead converted
const trueRecoveries = leads.filter(
  (l) => l.preview_sent_at && l.status === "converted"
);
const trueRecoveryCount = trueRecoveries.length;

// Calculate revenue from true recoveries by matching order_ids
const trueRecoveryOrderIds = new Set(
  trueRecoveries.map((l) => l.order_id).filter(Boolean)
);
const trueRecoveryRevenue = orders
  .filter((o) => trueRecoveryOrderIds.has(o.id) && o.status !== "cancelled")
  .reduce((sum, o) => sum + o.price, 0);

// Recovery rate: % of previews sent that converted
const recoveryRate = previewsSent > 0 
  ? Math.round((trueRecoveryCount / previewsSent) * 100) 
  : 0;

// Play-to-buy rate: of those who played, how many bought
const leadsWhoPlayedAndConverted = leads.filter(
  (l) => l.preview_sent_at && l.preview_played_at && l.status === "converted"
).length;
const leadsWhoPlayedPreview = leads.filter(
  (l) => l.preview_sent_at && l.preview_played_at
).length;
const playToBuyRate = leadsWhoPlayedPreview > 0 
  ? Math.round((leadsWhoPlayedAndConverted / leadsWhoPlayedPreview) * 100) 
  : 0;
```

### Updated Stats Cards

Replace/update these cards:

| Card | Value | Description |
|------|-------|-------------|
| **Previews Sent** | `62` | Total recovery emails sent |
| **True Recoveries** | `4` | `$196 revenue` |
| **Recovery Rate** | `6%` | `4 of 62 previews` |
| **Play → Buy** | `27%` | `4 of 15 who played` |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/admin/StatsCards.tsx` | Add `preview_sent_at` and `order_id` to Lead interface, update calculations and cards |

---

## Visual Changes

### Before
```text
[Lead Conversions: 8 | $399 revenue]
```

### After
```text
[Previews Sent: 62 | of 688 leads]
[True Recoveries: 4 | $196 revenue]
[Recovery Rate: 6% | 4 of 62 sent]
[Play → Buy: 27% | 4 of 15 played]
```

---

## Technical Notes

- The `preview_sent_at` field is already returned by the admin-orders endpoint (visible in LeadsTable interface)
- The `order_id` field links converted leads to their orders for revenue calculation
- This approach cleanly separates "marketing recovery funnel" metrics from "same-session checkout" metrics

