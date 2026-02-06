
# Song Language Feature - Complete Implementation Plan

## Overview

This plan implements the Song Language feature allowing users to choose the language their song is written and sung in, along with a configurable Suno model system for controlled upgrades.

---

## Part 1: Database Schema

### New Columns (migration for both `leads` and `orders`)

```sql
-- Song Language columns
ALTER TABLE leads 
  ADD COLUMN lyrics_language_code text NOT NULL DEFAULT 'en',
  ADD COLUMN lyrics_language_qa jsonb NULL,
  ADD COLUMN lyrics_raw_attempt_1 text NULL,
  ADD COLUMN lyrics_raw_attempt_2 text NULL;

ALTER TABLE orders 
  ADD COLUMN lyrics_language_code text NOT NULL DEFAULT 'en',
  ADD COLUMN lyrics_language_qa jsonb NULL,
  ADD COLUMN lyrics_raw_attempt_1 text NULL,
  ADD COLUMN lyrics_raw_attempt_2 text NULL;
```

### Supported Languages (Phase 1)

| Code | Label | Notes |
|------|-------|-------|
| en | English | Default |
| es | Spanish | Neutral Latin American |
| fr | French | |
| de | German | |
| it | Italian | |
| pt-BR | Portuguese (Brazil) | Brazilian phrasing |
| ja | Japanese | Latin-char names preserved |
| ko | Korean | Latin-char names preserved |
| sr | Serbian | Latin script default |
| hr | Croatian | Latin script |

---

## Part 2: Suno Model Configuration

### Admin Settings Table

A new setting `suno_model` will be added to the existing `admin_settings` table:

| Key | Default Value | Description |
|-----|---------------|-------------|
| `suno_model` | `V4_5` | Default Suno model for all generations |
| `suno_model_v5_enabled` | `false` | Enable V5 for controlled rollout |
| `suno_model_v5_priority_only` | `true` | If V5 enabled, only use for priority orders |

### Model Selection Logic

```text
┌─────────────────────────────────────────────────────────────┐
│                    Model Selection Flow                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
         ┌──────────────────────────────────────┐
         │   Is suno_model_v5_enabled = true?   │
         └──────────────────────────────────────┘
                    /           \
                 Yes             No
                  │               │
                  ▼               ▼
    ┌──────────────────────┐   Use default
    │ priority_only = true │   suno_model (V4_5)
    │ AND is_priority?     │
    └──────────────────────┘
           /         \
         Yes          No
          │            │
          ▼            ▼
      Use V5       Use default
      model        suno_model
```

### Logging

Every audio generation will log:
```
[AUDIO] Model used: V4_5 (default)
[AUDIO] Model used: V4_5PLUS (v5_enabled=true, priority=true)
```

---

## Part 3: Shared Language Utilities

### New File: `supabase/functions/_shared/language-utils.ts`

This shared module contains:

1. **Constants**
   - `LANGUAGE_LABELS`: Code → Label mapping
   - `SUPPORTED_LANGUAGE_CODES`: Array of valid codes
   - `MAX_RAW_LYRICS_LENGTH`: 4000 characters
   - `MIXED_LANGUAGE_THRESHOLD`: 0.20 (20%)

2. **Helper Functions**
   - `getLanguageLabel(code)`: Get display label from code
   - `getLanguageSpecificRules(code)`: Get prompt rules for each language
   - `truncateForStorage(text)`: Cap text at 4000 chars + "[TRUNCATED]"

3. **Detection Functions**
   - `detectByScript(text)`: Script-based detection (ja, ko, sr Cyrillic)
   - `detectByMarkers(text)`: Word marker detection for Latin languages
   - `extractDetectionSample(lyrics)`: Extract ~1500-2000 chars (Verse 1 + Chorus)
   - `runLanguageDetection(lyrics, requestedCode)`: Orchestrate tiered detection

4. **QA Functions**
   - `checkMixedLanguage(lyrics, targetCode)`: Detect mixed-language output
   - `runFluencyCheck(lyrics, languageCode)`: LLM fluency scoring
   - `runFullQA(lyrics, requestedCode)`: Complete QA gate

---

## Part 4: Edge Function Changes

### 4.1 automation-generate-audio/index.ts

**Changes:**

1. Add configurable Suno model selection
2. Add language-aware vocal diction note
3. Add detailed model logging

```typescript
// Fetch model settings
const { data: modelSetting } = await supabase
  .from("admin_settings")
  .select("value")
  .eq("key", "suno_model")
  .maybeSingle();

const { data: v5EnabledSetting } = await supabase
  .from("admin_settings")
  .select("value")
  .eq("key", "suno_model_v5_enabled")
  .maybeSingle();

const { data: v5PriorityOnlySetting } = await supabase
  .from("admin_settings")
  .select("value")
  .eq("key", "suno_model_v5_priority_only")
  .maybeSingle();

// Determine model
const defaultModel = modelSetting?.value || "V4_5";
const v5Enabled = v5EnabledSetting?.value === "true";
const v5PriorityOnly = v5PriorityOnlySetting?.value !== "false"; // Default true
const isPriority = entityType === "order" && rawEntity.pricing_tier === "priority";

let model = defaultModel;
if (v5Enabled && (!v5PriorityOnly || isPriority)) {
  model = "V4_5PLUS"; // v5 identifier
}

console.log(`[AUDIO] Model used: ${model} (v5_enabled=${v5Enabled}, priority=${isPriority})`);

// Add vocal diction note for non-English
let styleString = selectedStyle.suno_prompt;
const languageCode = rawEntity.lyrics_language_code || "en";
if (languageCode !== "en") {
  const languageLabel = getLanguageLabel(languageCode);
  styleString += `. Vocals in ${languageLabel}. Clear diction.`;
}
```

### 4.2 automation-generate-lyrics/index.ts

**Major Changes:**

1. Add language-aware prompt with specific rules
2. Implement full QA gate (detection → mixed-language → fluency)
3. Store raw attempts and QA results
4. Set `needs_review` on QA failure

**Key additions to EntityData interface:**
```typescript
lyrics_language_code: string;
```

**Language prompt block:**
```
## Language Requirements

The song MUST be written entirely in {LANGUAGE_LABEL} ({LANGUAGE_CODE}).

CRITICAL RULES:
1. Compose natively in this language using natural grammar, idioms, and emotional tone
2. Do NOT translate from English - write as a native songwriter would
3. Avoid literal phrasing and awkward syntax that sounds translated
4. Avoid stereotypes and cultural clichés
5. Keep proper names exactly as provided
6. Use natural idioms over direct translation

{LANGUAGE_SPECIFIC_RULES}
```

### 4.3 capture-lead/index.ts

**Changes:**
1. Accept `lyricsLanguageCode` parameter (default "en")
2. Include in `inputs_hash` computation

```typescript
interface LeadInput {
  // ... existing fields
  lyricsLanguageCode?: string;
}

// In insert:
lyrics_language_code: input.lyricsLanguageCode || "en",

// In hash computation:
const inputsHash = await computeInputsHash([
  input.recipientName.trim(),
  input.specialQualities.trim(),
  input.favoriteMemory.trim(),
  input.genre,
  input.occasion,
  input.lyricsLanguageCode || "en",  // NEW
]);
```

### 4.4 create-checkout/index.ts

**Changes:**
1. Accept `lyricsLanguageCode` in formData
2. Pass to Stripe metadata

```typescript
interface CheckoutInput {
  formData: {
    // ... existing fields
    lyricsLanguageCode?: string;
  };
}

// In metadata:
if (formData.lyricsLanguageCode) {
  metadata.lyricsLanguageCode = formData.lyricsLanguageCode;
}
```

### 4.5 stripe-webhook/index.ts

**Changes:**
1. Store `lyrics_language_code` from metadata
2. Include in `inputs_hash` computation

```typescript
// In order insert:
lyrics_language_code: metadata.lyricsLanguageCode || "en",

// In hash computation:
const inputsHash = await computeInputsHash([
  // ... existing fields
  metadata.lyricsLanguageCode || "en",  // NEW
]);
```

### 4.6 admin-orders/index.ts

**Changes:**
1. Add language update support with inputs_hash recalculation
2. Block language change during active generation
3. Clear language QA artifacts on regenerate/reset
4. Add `needs_review` to automation_status exclusions

**Reset automation additions:**
```typescript
const updates = {
  // ... existing fields
  lyrics_language_qa: null,
  lyrics_raw_attempt_1: null,
  lyrics_raw_attempt_2: null,
};
```

### 4.7 process-scheduled-deliveries/index.ts

**Changes:**
1. Explicitly exclude `automation_status = 'needs_review'` from generation queue
2. Explicitly exclude from delivery queue

```typescript
// In generation queue query:
.not("automation_status", "eq", "needs_review")

// In delivery queue query:
.not("automation_status", "eq", "needs_review")
```

### 4.8 send-song-delivery/index.ts

**Changes:**
1. Add `needs_review` safety check before sending
2. Include language label in email

```typescript
// Fetch order to verify status
const { data: order } = await supabase
  .from("orders")
  .select("automation_status, delivery_status, lyrics_language_code")
  .eq("id", orderId)
  .maybeSingle();

if (order?.automation_status === 'needs_review' || order?.delivery_status === 'needs_review') {
  return new Response(
    JSON.stringify({ error: "Cannot deliver: record needs review" }),
    { status: 400, headers: corsHeaders }
  );
}
```

### 4.9 send-lead-preview/index.ts

**Changes:**
1. Add `needs_review` safety check before sending
2. Include language label in email

---

## Part 5: Frontend Changes

### 5.1 FormData Interface (CreateSong.tsx)

```typescript
export interface FormData {
  // ... existing fields
  lyricsLanguageCode: string; // Default: "en"
}

const initialFormData: FormData = {
  // ... existing defaults
  lyricsLanguageCode: "en",
};
```

### 5.2 MusicStyleStep.tsx

Add language dropdown after singer preference:

```tsx
import { Globe } from "lucide-react";

const languageOptions = [
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
  { id: "it", label: "Italian" },
  { id: "pt-BR", label: "Portuguese (Brazil)" },
  { id: "ja", label: "Japanese" },
  { id: "ko", label: "Korean" },
  { id: "sr", label: "Serbian" },
  { id: "hr", label: "Croatian" },
];

// After singer preference section:
<div className="space-y-4">
  <div className="flex items-center gap-2">
    <Globe className="h-5 w-5 text-primary" />
    <Label className="text-lg font-semibold">
      Song Language <span className="text-destructive">*</span>
    </Label>
  </div>
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    {languageOptions.map((lang) => (
      <Card
        key={lang.id}
        onClick={() => updateFormData({ lyricsLanguageCode: lang.id })}
        className={`p-4 text-center cursor-pointer ...`}
      >
        {lang.label}
      </Card>
    ))}
  </div>
</div>
```

### 5.3 songFormValidation.ts

Update step4Schema:

```typescript
export const step4Schema = z.object({
  genre: z.string().min(1, "Please select a music genre"),
  singerPreference: z.string().min(1, "Please select a singer preference"),
  lyricsLanguageCode: z.string().min(1, "Please select a language").default("en"),
});
```

### 5.4 adminDropdownOptions.ts

Add language options:

```typescript
export const languageOptions = [
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
  { id: "it", label: "Italian" },
  { id: "pt-BR", label: "Portuguese (Brazil)" },
  { id: "ja", label: "Japanese" },
  { id: "ko", label: "Korean" },
  { id: "sr", label: "Serbian" },
  { id: "hr", label: "Croatian" },
];

export function getLanguageLabel(code: string): string {
  const found = languageOptions.find(opt => opt.id === code);
  return found?.label || code;
}
```

### 5.5 Admin.tsx

**Changes:**
1. Display `lyrics_language_code` in order/lead detail dialogs
2. Add language dropdown to edit mode
3. Show QA results in Debug Info panel
4. Add `needs_review` to status badges and filters
5. Add Suno Model Configuration section to Automation Dashboard

**Suno Model Admin UI:**
```tsx
// In Automation Dashboard settings section
<div className="space-y-4">
  <h3 className="font-semibold">Suno Model Configuration</h3>
  <div className="flex items-center gap-4">
    <Label>Default Model:</Label>
    <Select value={settings.suno_model || "V4_5"} onValueChange={...}>
      <SelectItem value="V4_5">V4.5 (Stable)</SelectItem>
      <SelectItem value="V4_5PLUS">V5 (Latest)</SelectItem>
    </Select>
  </div>
  <div className="flex items-center gap-4">
    <Switch checked={settings.suno_model_v5_enabled === "true"} />
    <Label>Enable V5 for controlled rollout</Label>
  </div>
  <div className="flex items-center gap-4">
    <Switch checked={settings.suno_model_v5_priority_only !== "false"} />
    <Label>V5 for priority orders only</Label>
  </div>
</div>
```

### 5.6 LeadsTable.tsx

**Changes:**
1. Display `lyrics_language_code` in lead detail dialog
2. Add language dropdown to edit mode
3. Show QA results in Debug Info

---

## Part 6: Files Summary

### New Files
| File | Purpose |
|------|---------|
| `supabase/functions/_shared/language-utils.ts` | Shared detection, QA, constants |

### Database Migration
- Add 4 columns to `leads` and `orders` tables

### Edge Functions (11 files)
| File | Changes |
|------|---------|
| `automation-generate-audio/index.ts` | Configurable model + vocal diction note |
| `automation-generate-lyrics/index.ts` | Language prompt + full QA gate |
| `admin-orders/index.ts` | Language editing + QA field clearing + model settings |
| `capture-lead/index.ts` | Accept language, include in hash |
| `create-checkout/index.ts` | Pass language in metadata |
| `stripe-webhook/index.ts` | Store language, include in hash |
| `process-scheduled-deliveries/index.ts` | Skip needs_review explicitly |
| `send-song-delivery/index.ts` | Safety check + language in email |
| `send-lead-preview/index.ts` | Safety check + language in email |
| `automation-get-settings/index.ts` | Support new model settings |

### Frontend (6 files)
| File | Changes |
|------|---------|
| `src/pages/CreateSong.tsx` | Add lyricsLanguageCode to FormData |
| `src/components/create/MusicStyleStep.tsx` | Add language dropdown |
| `src/lib/songFormValidation.ts` | Add language to step4Schema |
| `src/components/admin/adminDropdownOptions.ts` | Add languageOptions + model options |
| `src/pages/Admin.tsx` | Display/edit language, show QA, model settings |
| `src/components/admin/LeadsTable.tsx` | Display/edit language, show QA |

---

## Part 7: Implementation Order

1. **Database migration** - Add language columns to leads and orders
2. **Shared language utils** - Create `_shared/language-utils.ts`
3. **Lyrics generation** - Update with language prompt and QA gate
4. **Audio generation** - Add configurable model and vocal diction
5. **Scheduler** - Add needs_review exclusions
6. **Send functions** - Add safety checks and language in emails
7. **Admin endpoints** - Add language and model settings
8. **Lead capture + checkout** - Pass language through pipeline
9. **Frontend create flow** - Add language dropdown
10. **Frontend admin** - Display/edit language, model config

---

## Part 8: Acceptance Criteria

### Language Feature
1. User can select language on create flow (default English)
2. Language stored as `lyrics_language_code`, labels derived server-side
3. Language included in `inputs_hash`
4. Lyrics generated natively with cultural fluency rules
5. Spanish defaults to neutral Latin American
6. Portuguese defaults to Brazilian
7. Japanese/Korean preserve Latin-character names
8. Serbian/Croatian output Latin script, use `explicit_user_choice` method
9. Detection uses ~1500-2000 chars (Verse 1 + Chorus)
10. Deterministic detection first; LLM only when uncertain
11. Mixed-language fails QA if >20% foreign lines
12. Fluency always runs for es/pt-BR
13. QA stores both attempts with detection_sample
14. `needs_review` is first-class state (never auto-advances)
15. Raw attempts capped at 4000 chars
16. Wrong-language lyrics never reach Suno
17. Regeneration clears all language QA artifacts
18. Language visible in emails and admin

### Suno Model Configuration
1. Default model is V4_5 (current working value)
2. Admin can change default model via settings
3. V5 rollout is controllable (enabled/disabled)
4. V5 can be limited to priority orders only
5. Every generation logs which model was used
6. Model changes don't require code deployment

---

## Part 9: Technical Notes

### QA Gate Cost Optimization
- **Happy path** (correct language): 1 small detection check
- **Uncertain path**: 1 detection + 1 fluency check
- **Retry path**: 2 generations + 2 QA checks
- Deterministic detection avoids LLM calls for obvious cases

### sr/hr Latin Script Handling
- Detection validates but doesn't override user's explicit choice
- Method recorded as `explicit_user_choice` for debugging
- Informative issue note: "Language accepted based on user selection (Latin script ambiguity)"

### Suno Model Upgrade Path
1. Start: All generations use V4_5
2. Test: Enable V5 for priority orders only
3. Validate: Check audio quality and error rates
4. Expand: Disable priority_only to use V5 for all
5. Flip: Change default to V4_5PLUS once confirmed stable
