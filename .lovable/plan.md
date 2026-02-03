

# Background-First Automation System - Complete Implementation Plan

## Coverage Analysis: What's Already Implemented vs. Needed

| Concern | Current State | Action Needed |
|---------|---------------|---------------|
| **Input stability window** | ❌ None - generation starts immediately | Add 5-min delay for orders |
| **Timezone definition** | ⚠️ Implicit UTC | Document explicitly, use PST for display |
| **Cron concurrency/locking** | ⚠️ Partial - uses optimistic locks | Add atomic status updates |
| **Priority ordering** | ❌ None | Add priority field to queue processing |
| **Cost/surge visibility** | ❌ None | Add daily counter + logging |
| **Audio URL fallbacks** | ⚠️ Missing variants | Add all Suno URL fields |
| **Raw callback storage** | ❌ None | Add `automation_raw_callback` column |
| **Timing fields** | ❌ None | Add `earliest_generate_at`, `target_send_at` |
| **Delivery status tracking** | ⚠️ Implicit in order status | Add explicit `delivery_status` |
| **Rate limit handling** | ❌ None | Add `next_attempt_at` column + backoff |

---

## Phase 1: Database Schema Updates

Add all new tracking columns to both `leads` and `orders` tables:

```sql
-- Timing fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS earliest_generate_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS target_send_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS generated_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS automation_raw_callback jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS inputs_hash text;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS earliest_generate_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS target_send_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS generated_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS automation_raw_callback jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS inputs_hash text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_last_error text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_retry_count int DEFAULT 0;
```

---

## Phase 2: Timing Initialization at Entity Creation

### Orders (`stripe-webhook/index.ts`)

```text
Input Stability Window: 5 minutes after order creation

const now = Date.now();
const expectedDelivery = calculateExpectedDelivery(pricingTier);
const targetSendAt = new Date(new Date(expectedDelivery).getTime() - 12 * 60 * 60 * 1000);
const earliestGenerateAt = new Date(now + 5 * 60 * 1000); // 5-minute stabilization

// Compute inputs_hash from key fields
const inputsHash = computeHash([
  metadata.recipientName,
  metadata.specialQualities,
  metadata.favoriteMemory,
  metadata.genre,
  metadata.occasion,
]);

// Insert with timing fields
{
  earliest_generate_at: earliestGenerateAt.toISOString(),
  target_send_at: targetSendAt.toISOString(),
  inputs_hash: inputsHash,
  delivery_status: 'pending',
}
```

### Leads (`capture-lead/index.ts`)

```text
const now = Date.now();
const earliestGenerateAt = new Date(now); // Leads generate immediately
const targetSendAt = new Date(now + 24 * 60 * 60 * 1000); // Preview email 24h later

// Compute inputs_hash
const inputsHash = computeHash([
  input.recipientName,
  input.specialQualities,
  input.favoriteMemory,
  input.genre,
  input.occasion,
]);

// Insert with timing fields
{
  earliest_generate_at: earliestGenerateAt.toISOString(),
  target_send_at: targetSendAt.toISOString(),
  inputs_hash: inputsHash,
}
```

---

## Phase 3: Central Scheduler Enhancement (`process-scheduled-deliveries/index.ts`)

Transform the cron job into a full orchestrator:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                          CRON: Every Minute                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. STUCK AUDIO RECOVERY (existing)                                     │
│     - Find audio_generating > 5 min old                                 │
│     - Max 3 per run                                                     │
│                                                                         │
│  2. GENERATION QUEUE (new)                                              │
│     Query:                                                              │
│       WHERE earliest_generate_at <= now                                 │
│         AND automation_status IS NULL                                   │
│         AND (next_attempt_at IS NULL OR next_attempt_at <= now)         │
│         AND dismissed_at IS NULL                                        │
│         AND (for orders: status != 'cancelled')                         │
│     Priority: Orders first (priority tier > standard), then leads       │
│     Limit: 3 per run                                                    │
│     Action: Call automation-trigger for each                            │
│                                                                         │
│  3. ORDER DELIVERY QUEUE (existing + enhanced)                          │
│     Query:                                                              │
│       WHERE target_send_at <= now                                       │
│         AND automation_status = 'completed'                             │
│         AND sent_at IS NULL                                             │
│         AND dismissed_at IS NULL                                        │
│     Action: Send email, set sent_at                                     │
│                                                                         │
│  4. LEAD PREVIEW QUEUE (existing + catch-up)                            │
│     Query:                                                              │
│       WHERE target_send_at <= now                                       │
│         AND status = 'song_ready'                                       │
│         AND preview_sent_at IS NULL                                     │
│         AND dismissed_at IS NULL                                        │
│     Limit: 5 per run (for catch-up)                                     │
│     Action: Send preview email, set preview_sent_at                     │
│                                                                         │
│  5. SCHEDULED RESENDS (existing)                                        │
│                                                                         │
│  6. DAILY COST LOGGING (new)                                            │
│     At midnight: Log total generations for the day                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Concurrency Protection (Atomic Status Update)

When picking up entities for generation:

```javascript
// Use atomic update to claim the row (prevents double-pickup)
const { data: claimed, error } = await supabase
  .from(tableName)
  .update({
    automation_status: 'queued',
    automation_started_at: new Date().toISOString(),
  })
  .eq('id', entityId)
  .is('automation_status', null)  // Only if still unclaimed
  .select('id')
  .single();

if (!claimed) {
  console.log(`[SCHEDULER] Entity ${entityId} already claimed, skipping`);
  continue;
}
```

### Priority Queue Logic

```javascript
// Query orders first, prioritizing priority tier
const { data: pendingOrders } = await supabase
  .from('orders')
  .select('id, pricing_tier')
  .is('automation_status', null)
  .lte('earliest_generate_at', now)
  .is('dismissed_at', null)
  .neq('status', 'cancelled')
  .order('pricing_tier', { ascending: false }) // 'priority' > 'standard' alphabetically reversed
  .order('earliest_generate_at', { ascending: true })
  .limit(MAX_GENERATIONS_PER_RUN);

// Then leads (only if orders didn't fill the queue)
const remainingSlots = MAX_GENERATIONS_PER_RUN - (pendingOrders?.length || 0);
if (remainingSlots > 0) {
  const { data: pendingLeads } = await supabase
    .from('leads')
    .select('id')
    .is('automation_status', null)
    .lte('earliest_generate_at', now)
    .is('dismissed_at', null)
    .order('earliest_generate_at', { ascending: true })
    .limit(remainingSlots);
}
```

---

## Phase 4: Callback Normalization + Raw Storage (`automation-suno-callback/index.ts`)

### Store Raw Payload

```javascript
// Store raw callback immediately for debugging
await supabase
  .from(tableName)
  .update({
    automation_raw_callback: payload,
  })
  .eq('id', entityId);
```

### Normalized Audio URL Extraction

```javascript
function normalizeSunoCallback(payload: unknown): {
  audioUrl: string | null;
  coverUrl: string | null;
  title: string | null;
  duration: number | null;
  taskId: string | null;
} {
  // Handle nested structures - Suno sometimes nests data differently
  const songData = 
    payload?.data?.data?.[0] ||     // Callback format
    payload?.data?.response?.sunoData?.[0] ||  // Record-info format
    payload?.sunoData?.[0] ||
    payload?.data?.[0] ||
    {};

  // Try ALL known audio URL field variants
  const audioUrl = 
    songData.audioUrl || songData.audio_url ||
    songData.sourceAudioUrl || songData.source_audio_url ||
    songData.streamAudioUrl || songData.stream_audio_url ||
    songData.sourceStreamAudioUrl || songData.source_stream_audio_url ||
    null;

  const coverUrl =
    songData.imageUrl || songData.image_url ||
    songData.sourceImageUrl || songData.source_image_url ||
    null;

  console.log(`[NORMALIZE] Audio extracted from: ${
    songData.audioUrl ? 'audioUrl' :
    songData.audio_url ? 'audio_url' :
    songData.sourceAudioUrl ? 'sourceAudioUrl' :
    songData.source_audio_url ? 'source_audio_url' :
    songData.streamAudioUrl ? 'streamAudioUrl' :
    songData.stream_audio_url ? 'stream_audio_url' :
    'none found'
  }`);

  return {
    audioUrl,
    coverUrl,
    title: songData.title || null,
    duration: songData.duration || null,
    taskId: payload?.data?.task_id || payload?.data?.taskId || payload?.taskId || null,
  };
}
```

### Idempotency Guards (Enhanced)

```javascript
// Guard 1: Already has song (skip callback)
const existingSongUrl = entityType === 'order' ? entity.song_url : entity.preview_song_url;
if (existingSongUrl && !forceReprocess) {
  console.log(`[CALLBACK] Entity ${entityId} already has song, skipping`);
  return new Response('Already processed', { status: 200, headers: corsHeaders });
}

// Guard 2: Already sent (never overwrite)
if (entity.sent_at || entity.preview_sent_at) {
  console.log(`[CALLBACK] Entity ${entityId} already sent, ignoring callback`);
  return new Response('Already sent', { status: 200, headers: corsHeaders });
}

// Guard 3: Manual override active
if (entity.automation_manual_override_at) {
  console.log(`[CALLBACK] Manual override active for ${entityId}`);
  return new Response('Manual override', { status: 200, headers: corsHeaders });
}
```

---

## Phase 5: Rate Limit Handling (`automation-trigger/index.ts`)

### On 429 Response

```javascript
// If Kie returns 429, set backoff
if (response.status === 429) {
  const retryCount = (entity.automation_retry_count || 0) + 1;
  const backoffMinutes = Math.min(5 * Math.pow(2, retryCount - 1), 60); // 5, 10, 20, 40, 60
  const nextAttemptAt = new Date(Date.now() + backoffMinutes * 60 * 1000);

  await supabase
    .from(tableName)
    .update({
      automation_status: 'rate_limited',
      automation_retry_count: retryCount,
      next_attempt_at: nextAttemptAt.toISOString(),
      automation_last_error: `Rate limited, retry ${retryCount} at ${nextAttemptAt.toISOString()}`,
    })
    .eq('id', entityId);

  return { error: 'Rate limited', nextAttempt: nextAttemptAt };
}
```

### Permanent Failure After Max Retries

```javascript
const MAX_RETRIES = 3;

if (entity.automation_retry_count >= MAX_RETRIES) {
  await supabase
    .from(tableName)
    .update({
      automation_status: 'permanently_failed',
      automation_last_error: `Exceeded max retries (${MAX_RETRIES})`,
    })
    .eq('id', entityId);

  return { error: 'Permanently failed' };
}
```

---

## Phase 6: Delivery Time Safety (`process-scheduled-deliveries/index.ts`)

### Handle Past/Invalid `target_send_at`

```javascript
// If target_send_at is in the past at creation, add a small buffer
const targetSendAt = new Date(order.target_send_at);
const now = new Date();

if (targetSendAt < now) {
  // Don't send immediately - add 10-minute buffer for catch-up
  const bufferedSendAt = new Date(now.getTime() + 10 * 60 * 1000);
  console.log(`[SCHEDULER] target_send_at is past, buffering to ${bufferedSendAt.toISOString()}`);
  
  // Update the record so we don't pick it up again this run
  await supabase
    .from('orders')
    .update({ target_send_at: bufferedSendAt.toISOString() })
    .eq('id', order.id);
  
  continue; // Skip this run, pick up in next
}
```

### Validate Delivery Dates at Order Creation

```javascript
// In stripe-webhook
if (!expectedDelivery || isNaN(new Date(expectedDelivery).getTime())) {
  // Fall back to product SLA
  expectedDelivery = calculateExpectedDelivery(pricingTier);
  console.log(`[WEBHOOK] Invalid delivery date, using SLA default: ${expectedDelivery}`);
}

// Ensure target_send_at is in the future
let targetSendAt = new Date(new Date(expectedDelivery).getTime() - 12 * 60 * 60 * 1000);
if (targetSendAt <= new Date()) {
  // If already past, send in 30 minutes minimum
  targetSendAt = new Date(Date.now() + 30 * 60 * 1000);
  console.log(`[WEBHOOK] target_send_at was past, adjusted to ${targetSendAt.toISOString()}`);
}
```

---

## Phase 7: Input Change Detection

### Hash Computation Utility

```javascript
function computeInputsHash(entity: {
  recipient_name: string;
  special_qualities: string;
  favorite_memory: string;
  genre: string;
  occasion: string;
}): string {
  const combined = [
    entity.recipient_name,
    entity.special_qualities,
    entity.favorite_memory,
    entity.genre,
    entity.occasion,
  ].join('|');
  
  // Simple hash using Web Crypto
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}
```

### Check Before Sending

```javascript
// Before sending delivery email, verify inputs haven't changed
const currentHash = computeInputsHash(order);
if (order.inputs_hash && currentHash !== order.inputs_hash) {
  console.log(`[DELIVERY] Inputs changed for order ${order.id}, marking needs_review`);
  await supabase
    .from('orders')
    .update({
      delivery_status: 'needs_review',
      delivery_last_error: 'Inputs changed after generation',
    })
    .eq('id', order.id);
  continue;
}
```

---

## Summary: Files to Modify

| File | Changes |
|------|---------|
| Database migration | Add 12 new columns to leads, 15 to orders |
| `stripe-webhook/index.ts` | Set timing fields + inputs_hash on order creation |
| `capture-lead/index.ts` | Set timing fields + inputs_hash on lead creation |
| `automation-suno-callback/index.ts` | Store raw payload, normalize URLs, add idempotency guards |
| `automation-trigger/index.ts` | Handle 429 with backoff, permanent failure after retries |
| `process-scheduled-deliveries/index.ts` | Add generation queue, priority ordering, delivery safety |
| `admin-orders/index.ts` | Add "View Raw Callback" action |
| `src/pages/Admin.tsx` | Display new statuses, delivery_status, raw callback viewer |

---

## Acceptance Criteria by Scenario

### Scenario 1: Customer edits order after paying
- ✅ 5-minute stabilization window before generation starts
- ✅ `inputs_hash` computed at generation start
- ✅ If hash changes before audio completes, marks `needs_review`

### Scenario 2: Duplicate callback / double processing
- ✅ Check `song_url` before processing callback
- ✅ Check `sent_at` before sending
- ✅ Atomic status update for row claiming

### Scenario 3: Rate limiting / peak volume
- ✅ `next_attempt_at` column for backoff tracking
- ✅ Exponential backoff (5, 10, 20, 40, 60 min)
- ✅ Priority orders process before leads
- ✅ Max 3 generations per cron run

### Scenario 4: Unexpected Suno URL fields
- ✅ `normalizeSunoCallback()` tries all known field variants
- ✅ Raw payload stored for debugging
- ✅ Logs which field was successfully extracted

### Scenario 5: Bad delivery timing
- ✅ Invalid dates fall back to product SLA
- ✅ Past `target_send_at` gets 10-minute buffer
- ✅ `sent_at` prevents duplicate sends

---

## Timezone Documentation

**All timing calculations use UTC internally.**

- `earliest_generate_at` - UTC timestamp when generation may begin
- `target_send_at` - UTC timestamp when delivery email should send
- `expected_delivery` - UTC timestamp shown to customer (in their local interpretation)

**Admin display uses PST** for human readability, but storage remains UTC.

