
# Change Audio Preview Length: 35 → 45 Seconds

## Overview

Update the audio snippet/preview duration from 35 seconds to 45 seconds across the codebase.

---

## Files to Modify

| File | Line(s) | Change |
|------|---------|--------|
| `src/lib/audioClipper.ts` | 3, 6, 17, 28 | Update constant and comments from 35 to 45 |
| `supabase/functions/upload-song/index.ts` | 19, 268-269 | Update comment and function call from 35 to 45 |
| `src/pages/SongPreview.tsx` | 29, 77, 253 | Update default duration and UI text from 35 to 45 |

---

## Detailed Changes

### 1. Client-side Audio Clipper (`src/lib/audioClipper.ts`)

**Line 3** - Update comment:
```
Creates a 45-second preview clip from an audio file
```

**Line 6** - Update constant:
```typescript
const PREVIEW_DURATION_SECONDS = 45;
```

**Line 17** - Update comment:
```
// Calculate preview duration (minimum of file duration or 45 seconds)
```

**Line 28** - Update comment:
```
// Copy the first 45 seconds of audio
```

### 2. Server-side Upload Function (`supabase/functions/upload-song/index.ts`)

**Line 19** - Update comment:
```
// Create a 45-second preview clip from audio buffer
```

**Line 268-269** - Update function call:
```typescript
// Create and upload 45-second preview clip
const previewClip = createPreviewClip(uint8Array, 45);
```

### 3. Preview Page UI (`src/pages/SongPreview.tsx`)

**Line 29** - Update default duration state:
```typescript
const [duration, setDuration] = useState(45);
```

**Line 77** - Update fallback duration:
```typescript
setDuration(audioRef.current?.duration || 45);
```

**Line 253** - Update badge text:
```tsx
45-second preview
```

---

## After Implementation

- New lead song uploads will create 45-second preview clips
- The preview page will display "45-second preview" badge
- Existing 35-second previews will continue to work (duration is read from the actual audio file)
