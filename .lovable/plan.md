
## Add AI Song Generation for Orders

### Problem
Currently, admins can trigger AI song generation for leads but not for paid orders. This is because:
1. The `orders` table lacks automation tracking columns
2. All automation edge functions only work with leads
3. The Orders tab UI doesn't have an "AI Generate" button

### Solution
Extend the automation pipeline to support orders alongside leads.

---

## Database Changes

Add automation columns to the `orders` table to mirror the leads table:

```text
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS automation_status text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS automation_task_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS automation_lyrics text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS automation_started_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS automation_retry_count integer DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS automation_last_error text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS automation_style_id uuid REFERENCES song_styles(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS automation_manual_override_at timestamptz;
```

---

## Edge Function Changes

### 1. Create `automation-trigger-order` function
A new edge function that mirrors `automation-trigger` but works with orders:
- Accepts `orderId` instead of `leadId`
- Queries the `orders` table
- Calls the same lyrics/audio generation pipeline with an `entityType: "order"` parameter

### 2. Update `automation-generate-lyrics` and `automation-generate-audio`
Modify to accept an optional `orderId` parameter alongside `leadId`:
- Add `entityType` parameter ("lead" or "order")
- Query the appropriate table based on entity type
- Update the correct table with results

### 3. Update `automation-suno-callback`
Handle callbacks for both leads and orders:
- Store entity type in task metadata or use a lookup table
- Update the correct table when Suno completes

---

## UI Changes

### File: `src/pages/Admin.tsx`

Add an "AI Generate" button to each order card (similar to leads):

```text
<Button onClick={() => handleTriggerOrderAutomation(order)}>
  <Wand2 className="h-4 w-4 mr-2" />
  AI Generate
</Button>
```

Add state and handler:
- `triggeringOrderAutomation: string | null`
- `handleTriggerOrderAutomation(order: Order)`

Display automation status badges on order cards (like leads show).

---

## Alternative: Simpler Unified Approach

Instead of duplicating functions, refactor the existing ones to be "entity-agnostic":

1. Rename parameters to `entityId` and add `entityType: "lead" | "order"`
2. Create a helper function that queries/updates the correct table
3. Store `entityType` alongside `taskId` for callback routing

This reduces code duplication and ensures both leads and orders follow the exact same generation pipeline.

---

## Summary of Changes

| Component | Change |
|-----------|--------|
| Database | Add 8 automation columns to `orders` table |
| `automation-trigger` | Accept `orderId` + `entityType` parameter |
| `automation-generate-lyrics` | Support both leads and orders via `entityType` |
| `automation-generate-audio` | Support both leads and orders via `entityType` |
| `automation-suno-callback` | Route callbacks to correct table |
| `Admin.tsx` | Add AI Generate button to Orders tab |
| Order interface | Add automation fields to TypeScript interface |

---

## Estimated Scope
- Database migration: 1 migration file
- Edge functions: Modify 4 functions
- Frontend: Update Admin.tsx and Order interface
