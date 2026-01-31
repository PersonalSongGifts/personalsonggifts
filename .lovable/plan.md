

# Lead Quality Scoring System

## Problem
Some leads fill in low-quality or junk data:
- Single characters: "d", "E", "L"
- Test phrases: "asdf", "test", "Testing Zapp"
- Very short inputs that don't provide enough context for a song

This wastes time making songs that won't convert.

---

## Solution Overview

Add a **lead quality score** (0-100) that automatically evaluates each lead when captured. The admin dashboard will show this score so you can prioritize real leads over junk.

---

## Scoring Criteria

| Check | Points | Logic |
|-------|--------|-------|
| **Special Qualities Length** | 0-25 | <10 chars = 0, 10-30 = 10, 30-100 = 20, >100 = 25 |
| **Favorite Memory Length** | 0-25 | Same scale as above |
| **Not Gibberish** | 0-20 | Fails if matches: "test", "asdf", "aaa", single repeating chars |
| **Has Real Words** | 0-15 | Contains common English words (love, heart, memory, etc.) |
| **Valid Email Domain** | 0-10 | Not temporary/disposable email domains |
| **Phone Provided** | 0-5 | Bonus for providing phone number |

**Score Ranges:**
- 70-100: **High Quality** (green) - Prioritize these
- 40-69: **Medium Quality** (yellow) - Review manually
- 0-39: **Low Quality** (red) - Likely junk, skip or deprioritize

---

## What Changes

### 1. Database
Add `quality_score` column to `leads` table (integer, nullable).

### 2. Lead Capture Function
After validation passes, calculate quality score before inserting/updating.

### 3. Admin Dashboard
- Show quality score badge on each lead card
- Add filter: "High Quality Only", "Medium", "Low"
- Sort option: "By Quality Score"

### 4. Google Sheets Sync
Add quality score column so you can sort/filter in sheets too.

---

## Quality Scoring Logic (Server-Side)

```text
function calculateLeadQuality(lead):
  score = 0
  
  // Length scoring for special_qualities
  sqLen = length(special_qualities)
  if sqLen >= 100: score += 25
  else if sqLen >= 30: score += 20
  else if sqLen >= 10: score += 10
  else: score += 0
  
  // Length scoring for favorite_memory
  fmLen = length(favorite_memory)
  if fmLen >= 100: score += 25
  else if fmLen >= 30: score += 20
  else if fmLen >= 10: score += 10
  else: score += 0
  
  // Gibberish detection (deduct if matches)
  junkPatterns = ["test", "asdf", "qwer", "123", "xxx", "aaa"]
  combined = lower(special_qualities + favorite_memory)
  if any pattern in combined AND length < 20:
    score -= 20  // Heavy penalty
  
  // Real words bonus
  meaningfulWords = ["love", "heart", "memory", "always", "together", 
                     "beautiful", "special", "amazing", "best", "happy"]
  matchCount = count words in combined that match meaningfulWords
  score += min(matchCount * 5, 15)
  
  // Valid email (not disposable)
  disposableDomains = ["tempmail", "guerrilla", "10minute", "throwaway"]
  if email domain not in disposableDomains:
    score += 10
  
  // Phone bonus
  if phone provided:
    score += 5
  
  return clamp(score, 0, 100)
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/capture-lead/index.ts` | Add quality scoring function, store score |
| `supabase/functions/append-to-sheet/index.ts` | Add quality score column |
| `src/components/admin/LeadsTable.tsx` | Display score badge, add filter/sort |
| Database migration | Add `quality_score INTEGER` column |

---

## Admin View After Implementation

```text
┌─────────────────────────────────────────────────────────────────┐
│  LEAD • Stephen Thompson        [Unconverted]  [Quality: 85 ✓] │
│  Song for: Jessica • Valentine's Day • Pop                     │
│  "She has biggest heart and the most beautiful voice..."       │
│  Captured: Jan 30, 2026                                        │
│                                                                 │
│  [Upload Song]                              [View Details]      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  LEAD • test                    [Unconverted]  [Quality: 5 ✗]  │
│  Song for: ddf • Birthday • Pop                                │
│  "d"                                                           │
│  Captured: Jan 30, 2026                                        │
│                                                                 │
│  [Skip - Low Quality]                       [View Details]      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Filter Options

The admin can filter leads by quality:
- **All Leads** (default)
- **High Quality (70+)** - Focus on these for song creation
- **Medium Quality (40-69)** - Review if time permits
- **Low Quality (<40)** - Generally skip

---

## Backfill Existing Leads

Run a one-time migration to calculate quality scores for existing leads in the database.

---

## Technical Details

### Quality Score Function (Deno/TypeScript)

```typescript
function calculateLeadQuality(input: LeadInput): number {
  let score = 0;
  
  const sq = input.specialQualities.trim();
  const fm = input.favoriteMemory.trim();
  
  // Length scoring
  score += sq.length >= 100 ? 25 : sq.length >= 30 ? 20 : sq.length >= 10 ? 10 : 0;
  score += fm.length >= 100 ? 25 : fm.length >= 30 ? 20 : fm.length >= 10 ? 10 : 0;
  
  // Gibberish detection
  const combined = (sq + " " + fm).toLowerCase();
  const junkPatterns = /^(test|asdf|qwer|1234|xxx|aaa|zzz|abc|hjk|jkl|fgh)/i;
  const isAllSameChar = /^(.)\1+$/.test(sq) || /^(.)\1+$/.test(fm);
  
  if ((junkPatterns.test(sq) || junkPatterns.test(fm) || isAllSameChar) && combined.length < 30) {
    score = Math.max(0, score - 30);
  }
  
  // Meaningful words bonus
  const meaningfulWords = ['love', 'heart', 'memory', 'always', 'together', 
    'beautiful', 'special', 'amazing', 'best', 'happy', 'wonderful', 'caring',
    'family', 'friend', 'forever', 'remember', 'moment', 'laugh', 'smile'];
  const wordMatches = meaningfulWords.filter(w => combined.includes(w)).length;
  score += Math.min(wordMatches * 5, 15);
  
  // Email quality (not disposable)
  const disposableDomains = ['tempmail', 'guerrilla', '10minute', 'throwaway', 'mailinator'];
  const emailDomain = input.email.split('@')[1]?.toLowerCase() || '';
  if (!disposableDomains.some(d => emailDomain.includes(d))) {
    score += 10;
  }
  
  // Phone bonus
  if (input.phone && input.phone.trim().length >= 10) {
    score += 5;
  }
  
  return Math.max(0, Math.min(100, score));
}
```

