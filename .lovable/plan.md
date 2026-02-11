

## Order Activity Log

### Problem
When customers have issues (like Cathy's case where the wrong song was delivered), there's no way to trace what happened -- when songs were generated, regenerated, uploaded, or delivered. All investigation requires manual database queries.

### Solution
Add an `order_activity_log` table that records every significant event for orders and leads, then display a chronological timeline in the admin detail dialogs.

### What Gets Logged (Event Types)
- `order_created` -- new order placed
- `lyrics_generated` -- AI lyrics completed
- `audio_generated` -- AI audio completed (with Suno task ID)
- `song_uploaded` -- manual admin upload
- `song_regenerated` -- regeneration triggered (clears old assets)
- `delivery_sent` -- email delivered
- `delivery_scheduled` -- scheduled for future send
- `resend_scheduled` -- resend scheduled after song replacement
- `resend_sent` -- resend email delivered
- `automation_cancelled` -- admin stopped automation
- `automation_reset` -- automation reset for re-generation
- `lyrics_edited` -- admin manually edited lyrics
- `fields_updated` -- admin edited order/lead fields
- `lead_converted` -- lead became a paid order
- `order_cancelled` -- order dismissed/cancelled
- `order_restored` -- cancelled order restored

### UI
A collapsible "Activity Log" section inside the order/lead detail dialogs showing a vertical timeline with:
- Timestamp (PST)
- Event type badge (color-coded)
- Actor ("system" or "admin")
- Details text (e.g., "Lyrics generated, 1842 chars, language: en")

---

### Technical Details

#### 1. New Database Table

```sql
CREATE TABLE public.order_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,        -- 'order' or 'lead'
  entity_id uuid NOT NULL,
  event_type text NOT NULL,
  actor text NOT NULL DEFAULT 'system',  -- 'system' or 'admin'
  details text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_log_entity 
  ON public.order_activity_log (entity_type, entity_id, created_at DESC);

ALTER TABLE public.order_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No public access to activity log"
  ON public.order_activity_log FOR ALL
  USING (false);
```

#### 2. Shared Logging Helper

Create `supabase/functions/_shared/activity-log.ts` with a `logActivity()` function that edge functions can import:

```typescript
export async function logActivity(
  supabase: SupabaseClient,
  entityType: "order" | "lead",
  entityId: string,
  eventType: string,
  actor: "system" | "admin",
  details?: string,
  metadata?: Record<string, unknown>
)
```

#### 3. Edge Function Instrumentation

Add `logActivity()` calls to these existing edge functions:
- `admin-orders/index.ts` -- for regenerate, reset, cancel, field edits, lyrics edits, resend scheduling, delivery scheduling, order dismissal/restore
- `upload-song/index.ts` -- for manual song uploads
- `automation-generate-lyrics/index.ts` -- when lyrics are generated
- `automation-suno-callback/index.ts` -- when audio is generated
- `send-song-delivery/index.ts` -- when delivery email is sent
- `send-lead-preview/index.ts` -- when lead preview email is sent
- `process-lead-payment/index.ts` -- when lead converts to order
- `stripe-webhook/index.ts` -- when order is created
- `process-payment/index.ts` -- when order is created (fallback)

#### 4. Fetch Endpoint

Add a new action `get_activity_log` to `admin-orders/index.ts` that queries the log by entity_id, returns up to 100 events sorted by created_at DESC.

#### 5. Admin UI Component

Create `src/components/admin/ActivityLog.tsx`:
- Collapsible section using existing Collapsible component
- Fetches log when opened (lazy load)
- Vertical timeline with color-coded event badges
- Timestamps displayed in PST using existing `formatAdminDate`
- Placed inside both order and lead detail dialogs

#### 6. Files to Create
- `supabase/functions/_shared/activity-log.ts`
- `src/components/admin/ActivityLog.tsx`

#### 7. Files to Modify
- `supabase/functions/admin-orders/index.ts` (add get_activity_log action + log calls to existing actions)
- `supabase/functions/upload-song/index.ts` (log on upload)
- `supabase/functions/automation-generate-lyrics/index.ts` (log on lyrics ready)
- `supabase/functions/automation-suno-callback/index.ts` (log on audio ready)
- `supabase/functions/send-song-delivery/index.ts` (log on delivery)
- `supabase/functions/send-lead-preview/index.ts` (log on preview sent)
- `supabase/functions/process-lead-payment/index.ts` (log on conversion)
- `supabase/functions/stripe-webhook/index.ts` (log on order creation)
- `src/pages/Admin.tsx` (add ActivityLog component to order/lead detail dialogs)

