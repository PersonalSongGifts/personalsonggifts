

# Update Lyrics Generation for English Input Details

## Overview

This change ensures that users can enter personal details (special qualities, favorite memory, special message) in English even when requesting a song in another language. The system will intelligently rewrite these details in the target language while preserving proper nouns.

---

## Part 1: Update Language Prompt Block

### File: `supabase/functions/_shared/language-utils.ts`

Update the `buildLanguagePromptBlock` function (lines 409-433) to add the new instruction block about handling English input details.

**Current (lines 417-433):**
```typescript
return `

## Language Requirements

The song MUST be written entirely in ${label} (${languageCode}).

CRITICAL RULES:
1. Compose natively in this language using natural grammar, idioms, and emotional tone
2. Do NOT translate from English - write as a native ${label} songwriter would
3. Avoid literal phrasing and awkward syntax that sounds translated
4. Avoid stereotypes and cultural clichés
5. Keep proper names exactly as provided in their original form
6. Use natural idioms over direct translation

${rules}

IMPORTANT: Every lyric line must be in ${label}. Do not mix languages.`;
```

**Updated:**
```typescript
return `

## Language Requirements

The song MUST be written entirely in ${label} (${languageCode}).

CRITICAL RULES:
1. Compose natively in this language using natural grammar, idioms, and emotional tone
2. Do NOT translate from English - write as a native ${label} songwriter would
3. Avoid literal phrasing and awkward syntax that sounds translated
4. Avoid stereotypes and cultural clichés
5. Keep proper names exactly as provided in their original form
6. Use natural idioms over direct translation

${rules}

## Handling User-Provided Details

User-provided details (SpecialQualities, FavoriteMemory, SpecialMessage) may be written in English. Use them as source meaning and rewrite them naturally in ${label}. Do NOT copy English sentences into the lyrics. Preserve only proper nouns exactly as provided (names, places, brands). Everything else should be expressed natively in ${label} with natural syntax and idioms.

IMPORTANT: Every lyric line must be in ${label}. Do not mix languages except for preserved proper nouns.`;
```

---

## Part 2: Update Mixed-Language Guardrail

### File: `supabase/functions/_shared/language-utils.ts`

Update the `checkMixedLanguage` function (lines 308-353) to be smarter about detecting proper nouns vs full English lines.

**Key Changes:**

1. Before counting a line as "foreign," check if the English words are likely proper nouns
2. A line with 1-3 English proper nouns surrounded by target language text should pass
3. A line that is entirely or mostly English (>50% English function words) should still fail

**Updated function logic:**

```typescript
export function checkMixedLanguage(lyrics: string, targetCode: string): { passed: boolean; foreignPercentage: number; issues: string[] } {
  const lines = lyrics.split("\n")
    .map(l => l.trim())
    .filter(l => {
      // Skip empty lines, section headers, and very short lines
      if (!l || l.startsWith("[") || l.length < 3) return false;
      // Skip lines that are 2 words or fewer (likely hooks or proper nouns)
      const wordCount = l.split(/\s+/).length;
      if (wordCount <= 2) return false;
      // Skip mostly capitalized lines (likely hooks or exclamations)
      const upperCount = (l.match(/[A-Z]/g) || []).length;
      const letterCount = (l.match(/[a-zA-Z]/g) || []).length;
      if (letterCount > 0 && upperCount / letterCount > 0.6) return false;
      return true;
    });
  
  if (lines.length === 0) {
    return { passed: true, foreignPercentage: 0, issues: [] };
  }
  
  // English function words that indicate full English (not just proper nouns)
  const ENGLISH_FUNCTION_WORDS = /\b(the|and|you|for|are|but|not|with|have|this|will|your|from|they|been|would|there|their|what|about|that|was|were|has|had|can|could|should|would|is|am|be|been|being)\b/gi;
  
  let foreignLineCount = 0;
  
  for (const line of lines) {
    const words = line.split(/\s+/);
    const wordCount = words.length;
    
    // Count English function words in this line
    const englishFunctionWordMatches = line.match(ENGLISH_FUNCTION_WORDS) || [];
    const englishFunctionWordCount = englishFunctionWordMatches.length;
    
    // If >30% of words are English function words, this is likely a full English line
    const englishFunctionRatio = englishFunctionWordCount / wordCount;
    
    if (englishFunctionRatio > 0.3 && wordCount > 3) {
      // This looks like a full English line, not just proper nouns
      if (targetCode !== "en") {
        foreignLineCount++;
      }
      continue;
    }
    
    // For lines with low function word ratio, do standard marker detection
    // but be more lenient (proper nouns are expected)
    const detection = detectByMarkers(line);
    if (detection && detection.language === "en" && targetCode !== "en") {
      // Only count if high confidence English AND significant function words
      if (detection.confidence === "high" && englishFunctionWordCount >= 2) {
        foreignLineCount++;
      }
      // Otherwise assume it's proper nouns mixed with target language
    } else if (detection && detection.language !== targetCode && detection.language !== "en") {
      // Wrong non-English language detected
      foreignLineCount++;
    }
  }
  
  const foreignPercentage = foreignLineCount / lines.length;
  
  if (foreignPercentage > MIXED_LANGUAGE_THRESHOLD) {
    return {
      passed: false,
      foreignPercentage,
      issues: [`Mixed language detected: ${Math.round(foreignPercentage * 100)}% of lines appear to be full English or wrong language (proper nouns are allowed)`],
    };
  }
  
  return { passed: true, foreignPercentage, issues: [] };
}
```

---

## Part 3: Update Retry Prompt

### File: `supabase/functions/_shared/language-utils.ts`

Update `buildRetryLanguagePromptBlock` function (lines 439-455) to include the same guidance about English inputs.

**Updated:**
```typescript
export function buildRetryLanguagePromptBlock(languageCode: string, issues: string[]): string {
  const label = getLanguageLabel(languageCode);
  const baseBlock = buildLanguagePromptBlock(languageCode);
  
  return `${baseBlock}

## CRITICAL: Previous attempt failed language QA

The previous attempt had these issues:
${issues.map(i => `- ${i}`).join("\n")}

You MUST fix these issues in this attempt:
- Write ONLY in ${label} - no English sentences or phrases
- English proper nouns (names, places, brands) are OK to preserve
- Rewrite all user-provided details natively in ${label}
- Ensure natural ${label} phrasing, not translated English
- If you cannot write in ${label}, respond with "CANNOT_GENERATE_IN_LANGUAGE"`;
}
```

---

## Summary of Changes

| File | Function | Change |
|------|----------|--------|
| `_shared/language-utils.ts` | `buildLanguagePromptBlock` | Add "Handling User-Provided Details" section explaining English inputs should be rewritten |
| `_shared/language-utils.ts` | `checkMixedLanguage` | Add logic to distinguish proper nouns from full English lines using function word detection |
| `_shared/language-utils.ts` | `buildRetryLanguagePromptBlock` | Update retry instructions to clarify proper nouns are allowed |

---

## Expected Behavior After Changes

| Scenario | Before | After |
|----------|--------|-------|
| Line with "Sarah" in Spanish song | Could trigger false positive | Passes (proper noun) |
| Line with "Sarah loves the beach" in Spanish song | Passes as English | Fails (full English sentence) |
| Line with "En la playa con Sarah" | Passes | Passes (proper noun in Spanish) |
| Line with "The memories we share together" in Spanish song | Might pass with low detection | Fails (full English line) |
| User enters "She always makes me laugh" as special quality | AI might copy verbatim | AI rewrites natively in target language |

---

## No Database Changes Required

These are prompt and detection logic changes only. No schema changes needed.

