
# Add Song Language Editing to Admin Panel -- Final Implementation Plan

## Confirmed Details from Codebase Audit

**Hash implementations found in 4 files** (all identical, no trim/null handling):
- `stripe-webhook/index.ts` (lines 50-57) -- 8 fields including `lyricsLanguageCode`
- `capture-lead/index.ts` (lines 36-43) -- 6 fields including `lyricsLanguageCode`
- `process-payment/index.ts` (lines 45-52) -- 7 fields, MISSING `lyricsLanguageCode` (drift bug)
- `process-scheduled-deliveries/index.ts` (lines 15-22) -- 5 fields, MISSING `lyricsLanguageCode` (drift bug)

**Automation status values confirmed**: `"completed"` is the status for "song already generated" (set by `automation-suno-callback`).

**Delivery status values confirmed**: `"pending"`, `"scheduled"`, `"sent"`, `"needs_review"`, `"failed"` -- all already handled in the UI (badges, filters, scheduler exclusion).

**Serbian/Croatian**: No changes needed -- `language-utils.ts` already uses `"explicit_user_choice"` method; nothing in this plan touches detection override logic.

---

## Part 1: Create Shared Hash Utility

### New file: `supabase/functions/_shared/hash-utils.ts`

Create a single canonical hash function with proper trim and null coercion:

```typescript
export async function computeInputsHash(fields: string[]): Promise<string> {
  const combined = fields.map(f => (f ?? "").trim()).join("|");
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
}
```

### Update 4 existing consumers

All imports use `../_shared/hash-utils.ts` (every edge function is one level deep under `supabase/functions/`).

| File | Remove lines | Add import |
|------|-------------|------------|
| `stripe-webhook/index.ts` | Lines 49-57 | `import { computeInputsHash } from "../_shared/hash-utils.ts";` |
| `capture-lead/index.ts` | Lines 35-43 | `import { computeInputsHash } from "../_shared/hash-utils.ts";` |
| `process-payment/index.ts` | Lines 44-52 | `import { computeInputsHash } from "../_shared/hash-utils.ts";` |
| `process-scheduled-deliveries/index.ts` | Lines 14-22 | `import { computeInputsHash } from "../_shared/hash-utils.ts";` |

### Fix hash drift bugs

**`process-payment/index.ts` (line 141-149)**: Add missing `lyricsLanguageCode` to match `stripe-webhook`:
```typescript
const inputsHash = await computeInputsHash([
  metadata.recipientName || "",
  metadata.recipientNamePronunciation || "",
  metadata.specialQualities || "",
  metadata.favoriteMemory || "",
  metadata.genre || "",
  metadata.occasion || "",
  metadata.singerPreference || "",
  metadata.lyricsLanguageCode || "en",  // FIX: was missing
]);
```

**`process-scheduled-deliveries/index.ts` (line 245-251)**: Add missing fields to match order hash:
```typescript
const currentHash = await computeInputsHash([
  order.recipient_name || "",
  order.recipient_name_pronunciation || "",  // FIX: was missing
  order.special_qualities || "",
  order.favorite_memory || "",
  order.genre || "",
  order.occasion || "",
  order.singer_preference || "",             // FIX: was missing
  order.lyrics_language_code || "en",        // FIX: was missing
]);
```

---

## Part 2: Backend -- `admin-orders/index.ts`

### 2a. Import shared hash (top of file)

```typescript
import { computeInputsHash } from "../_shared/hash-utils.ts";
```

### 2b. Define in-flight status constant (near top)

```typescript
const IN_FLIGHT_STATUSES = ["pending", "queued", "lyrics_generating", "lyrics_ready", "audio_generating"];
```

### 2c. Update `update_order_fields` handler (line ~697)

1. Add `"lyrics_language_code"` to `allowedFields` array
2. After building `safeUpdates`, if `lyrics_language_code` is present:
   - Fetch the current order first
   - If `automation_status` is in `IN_FLIGHT_STATUSES`, return **409**: `"Reset automation before changing language."`
   - Allow if `automation_status` is `null`, `"failed"`, `"needs_review"`, or `"completed"`
3. After the update succeeds, if `lyrics_language_code` was changed:
   - Recompute `inputs_hash` using the canonical 8-field order list (matching stripe-webhook field order exactly)
   - If `automation_status === "completed"` (song already exists), also set `delivery_status = "needs_review"` to block auto-send
   - Save `inputs_hash` (and `delivery_status` if applicable) in a follow-up update

### 2d. Update `update_lead_fields` handler (line ~762)

1. Add `"lyrics_language_code"` to `allowedFields` array
2. Same in-flight automation guard as orders
3. After the update succeeds, if `lyrics_language_code` was changed:
   - Recompute `inputs_hash` using the canonical 6-field lead list (matching capture-lead field order exactly)

### 2e. Update `regenerate_song` handler (line ~1190)

Add to `clearUpdates` object:
```typescript
lyrics_language_qa: null,
lyrics_raw_attempt_1: null,
lyrics_raw_attempt_2: null,
```

### 2f. Update `reset_automation` handler (line ~1456)

Add to `updates` object:
```typescript
lyrics_language_qa: null,
lyrics_raw_attempt_1: null,
lyrics_raw_attempt_2: null,
```

---

## Part 3: Frontend -- Orders (`src/pages/Admin.tsx`)

### 3a. Update Order interface (after line 97)

Add: `lyrics_language_code?: string;`

### 3b. Update imports (line 30)

```typescript
import { genreOptions, singerOptions, occasionOptions, languageOptions, getLanguageLabel } from "@/components/admin/adminDropdownOptions";
```

### 3c. Update `startEditingOrder` (line 572-587)

Add to the editedOrder object:
```typescript
lyrics_language_code: selectedOrder.lyrics_language_code || "en",
```

### 3d. Update detail grid (line 1515)

Change `grid-cols-3` to `grid-cols-4` and add a 4th Language column after Singer:

- **View mode**: Display as `"es -- Spanish"` format using `${code} -- ${getLanguageLabel(code)}`
- **Edit mode**: `<Select>` dropdown populated from `languageOptions`, defaulting to `"en"`

### 3e. UX nudge in `handleSaveOrderEdits` (line 531-567)

After save succeeds (line 548-557), check if language changed. If so, show a **default** variant toast:
```typescript
if (editedOrder.lyrics_language_code && 
    editedOrder.lyrics_language_code !== selectedOrder.lyrics_language_code) {
  toast({
    title: "Language Changed",
    description: "Click Regenerate Song to produce the new version.",
  });
}
```

---

## Part 4: Frontend -- Leads (`src/components/admin/LeadsTable.tsx`)

### 4a. Update Lead interface (after line 71)

Add: `lyrics_language_code?: string;`

### 4b. Update imports (line 19)

```typescript
import { genreOptions, singerOptions, occasionOptions, languageOptions, getLanguageLabel } from "@/components/admin/adminDropdownOptions";
```

### 4c. Update `startEditingLead` (line 738-754)

Add to the editedLead object:
```typescript
lyrics_language_code: selectedLead.lyrics_language_code || "en",
```

### 4d. Update lead detail grid (line 1401)

Same pattern as orders: `grid-cols-3` to `grid-cols-4`, add Language column with "code -- label" view mode and dropdown edit mode.

### 4e. UX nudge in `handleSaveLeadEdits` (line 693-735)

After save succeeds (line 716-724), check if language changed. If so, show a **default** variant toast (same text as orders).

---

## Summary of All File Changes

| File | Action | Change |
|------|--------|--------|
| `_shared/hash-utils.ts` | **CREATE** | Shared `computeInputsHash` with trim + null coercion |
| `stripe-webhook/index.ts` | EDIT | Remove local hash fn (lines 49-57), add import |
| `capture-lead/index.ts` | EDIT | Remove local hash fn (lines 35-43), add import |
| `process-payment/index.ts` | EDIT | Remove local hash fn (lines 44-52), add import, add `lyricsLanguageCode` to hash field list |
| `process-scheduled-deliveries/index.ts` | EDIT | Remove local hash fn (lines 14-22), add import, add 3 missing fields to delivery hash |
| `admin-orders/index.ts` | EDIT | Import shared hash; whitelist `lyrics_language_code` for orders + leads; in-flight automation guard (409); hash recompute on save; `delivery_status = "needs_review"` for completed orders; clear QA artifacts on regenerate/reset |
| `src/pages/Admin.tsx` | EDIT | Add `lyrics_language_code` to Order interface, edit state, 4-col grid with "code -- label" display, default toast |
| `src/components/admin/LeadsTable.tsx` | EDIT | Add `lyrics_language_code` to Lead interface, edit state, 4-col grid with "code -- label" display, default toast |

## No Database Changes Required

All columns already exist. All `delivery_status` values (`"needs_review"`, `"pending"`, etc.) are already handled in the scheduler, filters, and UI badges.

## Serbian/Croatian Handling

No changes. The `language-utils.ts` detection already uses `"explicit_user_choice"` for `sr`/`hr` and never overrides the user's language selection. This plan does not modify any detection logic.
