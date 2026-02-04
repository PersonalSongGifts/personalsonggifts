
# Name Pronunciation Control + Safe Regeneration Flow

## Overview

This feature addresses your #1 customer complaint: incorrect pronunciation of recipient names in AI-generated songs. The solution provides admins with both **preventative** (pre-generation pronunciation override) and **corrective** (safe regeneration flow) controls.

---

## Summary of Changes

| Area | What Changes |
|------|--------------|
| Database | Add `recipient_name_pronunciation` column to `orders` and `leads` tables |
| Admin UI - Orders | Add "Pronunciation Override" field in edit mode |
| Admin UI - Leads | Add "Pronunciation Override" field in edit mode |
| Admin UI - Both | Add "Regenerate Song" button with send-timing dialog |
| Lyrics Generation | Use pronunciation value instead of display name when present |
| Change Detection | Include pronunciation in `inputs_hash` calculation |
| Backend Action | New `regenerate_song` action in admin-orders |

---

## Feature 1: Pronunciation Override Field

### Database Migration

Add a new nullable text column to both tables:

```text
orders.recipient_name_pronunciation (text, nullable)
leads.recipient_name_pronunciation (text, nullable)
```

### Admin UI - Order Edit Dialog

In the "Recipient" section of the order edit form (around line 1270-1290 in Admin.tsx), add:

```text
┌─────────────────────────────────────────┐
│ Recipient                               │
├─────────────────────────────────────────┤
│ Name: [Corey________________]           │
│                                         │
│ Pronunciation Override                  │
│ [coreee___________________]             │
│ Spell the name how you want it sung.    │
│ Avoid dashes or symbols. Use stretched  │
│ vowels if needed.                       │
│ Examples: koree, corree, jhanay         │
└─────────────────────────────────────────┘
```

This field is:
- Only visible when editing (not in read-only view)
- Saved to `recipient_name_pronunciation` column
- Never shown in any customer-facing UI

### Admin UI - Lead Edit Dialog

Same field added to the lead edit form in LeadsTable.tsx (around line 730-745).

### Backend Whitelist Update

In `admin-orders/index.ts`:
- Add `recipient_name_pronunciation` to the allowed fields list for `update_order_fields` action (line 686-689)
- Add `recipient_name_pronunciation` to the allowed fields list for `update_lead_fields` action (line 748-752)

---

## Feature 2: Lyrics Generation Integration

### automation-generate-lyrics/index.ts Changes

Update the `normalizeEntityData` function to include:
```typescript
recipient_name_pronunciation: entity.recipient_name_pronunciation as string | null,
```

Update the user prompt to use pronunciation when present:

```text
// If pronunciation override exists, use it ONLY
RecipientName: ${entity.recipient_name_pronunciation || entity.recipient_name}

// Add explicit pronunciation instruction when override is set
${entity.recipient_name_pronunciation ? `
IMPORTANT PRONUNCIATION:
When singing the recipient's name, use exactly: "${entity.recipient_name_pronunciation}"
This spelling is intentional for correct pronunciation and must be followed.
` : ""}
```

The display name (`recipient_name`) is never included when a pronunciation override exists. Only the phonetic spelling enters the AI model.

---

## Feature 3: Change Detection

### Update inputs_hash Calculation

In both `stripe-webhook/index.ts` and `process-payment/index.ts`, update the `computeInputsHash` function call to include the pronunciation field:

```typescript
const inputsHash = await computeInputsHash([
  metadata.recipientName || "",
  metadata.recipientNamePronunciation || "", // NEW
  metadata.specialQualities || "",
  metadata.favoriteMemory || "",
  metadata.genre || "",
  metadata.occasion || "",
]);
```

### Behavior When Pronunciation Changes

When an admin updates `recipient_name_pronunciation` on an order/lead that already has a song:

1. If `song_url` (orders) or `preview_song_url` (leads) exists
2. And `inputs_hash` changes
3. Set `delivery_status = 'needs_review'`
4. Item appears in "Needs Attention" filter
5. No auto-regeneration without admin intent

This logic will be handled in the `update_order_fields` and `update_lead_fields` actions.

---

## Feature 4: Regenerate Song Action

### New Admin Button

Add a "Regenerate Song" button visible when:
- Orders have `song_url`
- Leads have `preview_song_url`

This is a **secondary action** (not destructive red like "Reset + Regenerate").

### Regeneration Dialog UI

```text
┌────────────────────────────────────────────────┐
│         🔄 Regenerate Song                     │
├────────────────────────────────────────────────┤
│                                                │
│  This will generate a new song using the       │
│  current details, including any pronunciation  │
│  overrides.                                    │
│                                                │
│  The existing song will be replaced.           │
│                                                │
│  After generation, how should we send?         │
│                                                │
│  ○ Send immediately (5 min)                    │
│  ○ Schedule send (pick date & time)            │
│  ○ Default auto-send (12 hours later)          │
│                                                │
│  [DateTime Picker - if "Schedule" selected]    │
│                                                │
│            [Cancel]    [Regenerate Song]       │
│                                                │
└────────────────────────────────────────────────┘
```

### New Backend Action: regenerate_song

Add to `admin-orders/index.ts`:

```typescript
if (body?.action === "regenerate_song") {
  const orderId = typeof body.orderId === "string" ? body.orderId : null;
  const leadId = typeof body.leadId === "string" ? body.leadId : null;
  const sendOption = body.sendOption as string; // "immediate" | "scheduled" | "auto"
  const scheduledAt = body.scheduledAt as string | null;
  
  // Validate entity exists
  // ...
  
  // Clear generation artifacts
  const clearUpdates = {
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
    automation_manual_override_at: null,
    sent_at: null,
    delivery_status: "pending",
  };
  
  // Entity-specific clears
  if (orderId) {
    clearUpdates.song_url = null;
    clearUpdates.song_title = null;
    clearUpdates.cover_image_url = null;
  } else {
    clearUpdates.preview_song_url = null;
    clearUpdates.full_song_url = null;
    clearUpdates.song_title = null;
    clearUpdates.cover_image_url = null;
    clearUpdates.preview_token = null;
    clearUpdates.preview_sent_at = null;
  }
  
  // Compute target_send_at based on sendOption
  const now = Date.now();
  let targetSendAt: string;
  
  switch (sendOption) {
    case "immediate":
      targetSendAt = new Date(now + 5 * 60 * 1000).toISOString();
      break;
    case "scheduled":
      targetSendAt = scheduledAt!;
      break;
    case "auto":
    default:
      targetSendAt = new Date(now + 12 * 60 * 60 * 1000).toISOString();
  }
  
  clearUpdates.target_send_at = targetSendAt;
  clearUpdates.earliest_generate_at = new Date(now + 5 * 60 * 1000).toISOString();
  
  // Update entity
  await supabase.from(tableName).update(clearUpdates).eq("id", entityId);
  
  // Trigger automation with forceRun=true
  await fetch(`${supabaseUrl}/functions/v1/automation-trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
    body: JSON.stringify(orderId ? { orderId, forceRun: true } : { leadId, forceRun: true }),
  });
  
  return { success: true, targetSendAt };
}
```

### Lead vs Order Enforcement

The automation-trigger and downstream functions already handle this correctly:
- **Leads**: Generate 45-second preview via `createAudioPreview`, use preview email
- **Orders**: Generate full-length song, use delivery email

No changes needed - the entity type determines behavior automatically.

---

## Safety Guarantees

| Protection | How It Works |
|------------|--------------|
| Rate limiting | Respects existing retry counters (max 3 attempts) |
| Failed regenerations | Surface in "Needs Attention" filter via `automation_status = "failed"` |
| No duplicate emails | `sent_at` cleared on regeneration; cron only sends when `automation_status = completed` AND `sent_at IS NULL` |
| Admin visibility | Regenerating items show "Generating..." status badge |

---

## Files to Modify

### Database
| File | Change |
|------|--------|
| New migration | Add `recipient_name_pronunciation` to `orders` and `leads` tables |

### Frontend
| File | Change |
|------|--------|
| `src/pages/Admin.tsx` | Add pronunciation field to order edit form, add Regenerate button with dialog, new state variables |
| `src/components/admin/LeadsTable.tsx` | Add pronunciation field to lead edit form, add Regenerate button with dialog |

### Edge Functions
| File | Change |
|------|--------|
| `supabase/functions/admin-orders/index.ts` | Add `recipient_name_pronunciation` to allowed fields, add `regenerate_song` action, add change detection logic |
| `supabase/functions/automation-generate-lyrics/index.ts` | Use pronunciation override in prompt when present |
| `supabase/functions/stripe-webhook/index.ts` | Include pronunciation in `inputs_hash` calculation |
| `supabase/functions/process-payment/index.ts` | Include pronunciation in `inputs_hash` calculation |

---

## Technical Details

### Pronunciation in Lyrics Prompt

When `recipient_name_pronunciation` is set (e.g., "coreee"):

```text
RecipientName: coreee

IMPORTANT PRONUNCIATION:
When singing the recipient's name, use exactly: "coreee"
This spelling is intentional for correct pronunciation and must be followed.
```

The display name "Corey" is **never** included in the prompt when a pronunciation override exists.

### Updated Order Interface

Add to the Order interface in Admin.tsx:
```typescript
recipient_name_pronunciation: string | null;
```

Add to the Lead interface in LeadsTable.tsx:
```typescript
recipient_name_pronunciation?: string | null;
```

### State Management for Regeneration Dialog

```typescript
// New state in Admin.tsx
const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
const [regenerateSendOption, setRegenerateSendOption] = useState<"immediate" | "scheduled" | "auto">("auto");
const [regenerateScheduledAt, setRegenerateScheduledAt] = useState<Date | null>(null);
const [regenerating, setRegenerating] = useState(false);

// Similar state in LeadsTable.tsx
```

### Regeneration Flow Diagram

```text
Admin clicks "Regenerate Song"
        │
        ▼
Dialog opens → selects send option
        │
        ▼
regenerate_song action:
  1. Clear all generation artifacts
  2. Clear song_url / preview_song_url
  3. Set target_send_at based on selection
  4. Call automation-trigger (forceRun=true)
        │
        ▼
automation-trigger:
  1. Generate lyrics (uses pronunciation if set)
  2. Generate audio
        │
        ▼
automation-suno-callback:
  1. Save new song_url
  2. Set automation_status = completed
  3. Set delivery_status = scheduled
        │
        ▼
process-scheduled-deliveries cron:
  1. When target_send_at reached
  2. Send email (correct type for lead vs order)
  3. Set sent_at
```

---

## Validation Checklist

| Requirement | Implementation |
|-------------|----------------|
| Pronunciation uses respelled phonetics only (no dashes) | UI helper text guides admins; no technical enforcement needed |
| Pronunciation is generation-only, never customer-visible | Field excluded from all email templates, song pages, and external syncs |
| Regeneration respects lead vs order delivery rules | Entity type determined at trigger time, uses appropriate song length and email template |
| Default behavior auto-sends after 12 hours | "auto" option (default) sets `target_send_at = now + 12 hours` |
