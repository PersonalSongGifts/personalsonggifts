
# Fix Genre Mapping Mismatch in Audio Generation

## Problem Identified

The Jazz song for order AE6625B2 used a **Pop style** instead of Jazz because:

1. Database stores genres as lowercase slugs: `jazz`, `rnb`, `rap-hip-hop`, `edm-dance`
2. The `genreMap` in `automation-generate-audio` expects display labels: `Jazz`, `R&B`, `Rap / Hip-Hop`
3. When lookup fails, code falls back to `pop` style

This affects **most genres** - only `Pop`, `Country`, `Rock`, and `Acoustic` work correctly because their slug equals their display label (case-insensitive).

---

## Root Cause

**File:** `supabase/functions/automation-generate-audio/index.ts` (lines 106-122)

```typescript
// CURRENT - Expects display labels
const genreMap: Record<string, string> = {
  "Pop": "pop",
  "Jazz": "jazz",        // ❌ DB has "jazz", not "Jazz"
  "R&B": "r&b",          // ❌ DB has "rnb", not "R&B"
  "Rap / Hip-Hop": "hip-hop",  // ❌ DB has "rap-hip-hop"
  "EDM / Dance": "edm",  // ❌ DB has "edm-dance"
  "K-Pop": "k-pop",      // ❌ DB has "kpop"
  // ...
};

const normalizedGenre = genreMap[entity.genre] || "pop";  // Falls back to pop!
```

---

## Solution

Update the `genreMap` to handle **both** the database slug format AND display labels (for backward compatibility):

```typescript
const genreMap: Record<string, string> = {
  // Database slug format (primary)
  "pop": "pop",
  "country": "country",
  "rock": "rock",
  "rnb": "r&b",
  "jazz": "jazz",
  "acoustic": "acoustic",
  "rap-hip-hop": "hip-hop",
  "indie": "indie-folk",
  "latin": "latin-pop",
  "kpop": "k-pop",
  "edm-dance": "edm",
  
  // Display label format (backward compatibility)
  "Pop": "pop",
  "Country": "country",
  "Rock": "rock",
  "R&B": "r&b",
  "Jazz": "jazz",
  "Acoustic": "acoustic",
  "Rap / Hip-Hop": "hip-hop",
  "Hip-Hop": "hip-hop",
  "Indie": "indie-folk",
  "Indie Folk": "indie-folk",
  "Latin": "latin-pop",
  "Latin Pop": "latin-pop",
  "K-Pop": "k-pop",
  "EDM / Dance": "edm",
  "EDM": "edm",
};
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/automation-generate-audio/index.ts` | Update genreMap to include database slug format |

---

## Verification

After the fix, here's the complete mapping that will work:

| Admin Dropdown ID | song_styles.genre_match | Status |
|-------------------|------------------------|--------|
| `pop` | `pop` | ✅ |
| `country` | `country` | ✅ |
| `rock` | `rock` | ✅ |
| `rnb` | `r&b` | ✅ (fixed) |
| `jazz` | `jazz` | ✅ (fixed) |
| `acoustic` | `acoustic` | ✅ |
| `rap-hip-hop` | `hip-hop` | ✅ (fixed) |
| `indie` | `indie-folk` | ✅ (fixed) |
| `latin` | `latin-pop` | ✅ (fixed) |
| `kpop` | `k-pop` | ✅ (fixed) |
| `edm-dance` | `edm` | ✅ (fixed) |

---

## Additional Logging

Add a warning log when falling back to pop so we can catch future mismatches:

```typescript
const normalizedGenre = genreMap[entity.genre];
if (!normalizedGenre) {
  console.warn(`[AUDIO] Unknown genre "${entity.genre}", falling back to pop`);
}
const finalGenre = normalizedGenre || "pop";
```

---

## Expected Outcome

After this fix:
- Jazz songs will use the Jazz style prompt
- R&B songs will use the R&B style prompt
- All other genres will correctly match their respective style prompts
- No more silent fallbacks to Pop
