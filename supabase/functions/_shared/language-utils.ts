// Language utilities for song generation QA
// Shared across automation-generate-lyrics, automation-generate-audio, and admin functions

// ============= CONSTANTS =============

export const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  "pt-BR": "Portuguese (Brazil)",
  ja: "Japanese",
  ko: "Korean",
  sr: "Serbian",
  hr: "Croatian",
};

export const SUPPORTED_LANGUAGE_CODES = Object.keys(LANGUAGE_LABELS);

export const MAX_RAW_LYRICS_LENGTH = 4000;
export const MIXED_LANGUAGE_THRESHOLD = 0.20; // 20% - tunable if Spanish hooks cause false positives

// Language-specific rules for the lyrics generation prompt
const LANGUAGE_SPECIFIC_RULES: Record<string, string> = {
  en: "",
  es: `- Use neutral Latin American Spanish (avoid vosotros, prefer ustedes)
- Avoid Spain-specific slang or expressions
- Keep emotional warmth typical of Latin ballads`,
  fr: `- Use contemporary conversational French
- Avoid overly formal or literary language
- Keep natural romantic tone`,
  de: `- Use modern conversational German
- Avoid overly formal "Sie" forms where possible
- Keep emotional directness`,
  it: `- Use natural Italian phrasing
- Embrace melodic Italian vowel patterns
- Keep passionate, expressive tone`,
  "pt-BR": `- Use Brazilian Portuguese (not European)
- Include typical Brazilian warmth and affection
- Avoid formal "você" when informal works better`,
  ja: `- Use natural Japanese with appropriate keigo level
- Keep names in their original Latin characters (do not transliterate)
- Include natural Japanese emotional expressions`,
  ko: `- Use natural Korean with appropriate honorifics
- Keep names in their original Latin characters (do not transliterate)
- Include natural Korean emotional expressions (jeong, nunchi concepts)`,
  sr: `- Write in Latin script (not Cyrillic)
- Use natural Serbian phrasing
- Keep Southern Slavic warmth and expressiveness`,
  hr: `- Write in Latin script
- Use natural Croatian phrasing
- Keep Southern Slavic warmth and expressiveness`,
};

// Script detection markers
const CYRILLIC_PATTERN = /[\u0400-\u04FF]/;
const HIRAGANA_PATTERN = /[\u3040-\u309F]/;
const KATAKANA_PATTERN = /[\u30A0-\u30FF]/;
const KANJI_PATTERN = /[\u4E00-\u9FAF]/;
const HANGUL_PATTERN = /[\uAC00-\uD7AF\u1100-\u11FF]/;

// Language markers for Latin script languages
const LANGUAGE_MARKERS: Record<string, RegExp[]> = {
  es: [
    /\b(que|para|con|los|las|una|del|por|está|como|pero|más|tiene|muy|también|donde|cuando|porque|después|antes)\b/gi,
    /[áéíóúñ¿¡]/g,
  ],
  fr: [
    /\b(que|pour|avec|les|une|des|dans|qui|sur|est|sont|pas|nous|vous|leur|cette|tout|bien|fait|être)\b/gi,
    /[àâäéèêëïîôùûüçœæ]/g,
  ],
  de: [
    /\b(und|der|die|das|ist|ich|sie|wir|nicht|mit|auf|für|von|haben|werden|sein|kann|auch|wenn|noch)\b/gi,
    /[äöüß]/g,
  ],
  it: [
    /\b(che|per|con|una|del|sono|non|come|più|anche|loro|essere|tutto|quando|sempre|questa|quello|dove|perché)\b/gi,
    /[àèéìíîòóùú]/g,
  ],
  "pt-BR": [
    /\b(que|para|com|uma|não|você|mais|como|isso|ela|dele|dela|também|muito|quando|onde|porque|depois|antes)\b/gi,
    /[áàâãéêíóôõúç]/g,
  ],
  // Serbian and Croatian share many words, detection trusts user's choice
  sr: [
    /\b(sam|ali|jer|kada|gde|što|ima|nije|može|mora|bilo|samo|preko|između|nakon|ispod)\b/gi,
  ],
  hr: [
    /\b(sam|ali|jer|kada|gdje|što|ima|nije|može|mora|bilo|samo|preko|između|nakon|ispod)\b/gi,
  ],
  en: [
    /\b(the|and|you|for|are|but|not|with|have|this|will|your|from|they|been|would|there|their|what|about)\b/gi,
  ],
};

// ============= HELPER FUNCTIONS =============

export function getLanguageLabel(code: string): string {
  return LANGUAGE_LABELS[code] || code;
}

export function getLanguageSpecificRules(code: string): string {
  return LANGUAGE_SPECIFIC_RULES[code] || "";
}

export function truncateForStorage(text: string | null | undefined): string | null {
  if (!text) return null;
  if (text.length <= MAX_RAW_LYRICS_LENGTH) return text;
  return text.substring(0, MAX_RAW_LYRICS_LENGTH - 12) + " [TRUNCATED]";
}

export function isValidLanguageCode(code: string): boolean {
  return SUPPORTED_LANGUAGE_CODES.includes(code);
}

// ============= DETECTION FUNCTIONS =============

interface DetectionResult {
  detected_language: string;
  confidence: "high" | "medium" | "low";
  matches_requested: boolean;
  method: "script" | "markers" | "llm" | "explicit_user_choice";
  issues: string[];
  detection_sample?: string;
}

/**
 * Detect language by non-Latin scripts (Japanese, Korean, Cyrillic)
 * Returns null if no script match found
 */
export function detectByScript(text: string): { language: string; confidence: "high" } | null {
  // Count script occurrences
  const cyrillicCount = (text.match(CYRILLIC_PATTERN) || []).length;
  const hiraganaCount = (text.match(HIRAGANA_PATTERN) || []).length;
  const katakanaCount = (text.match(KATAKANA_PATTERN) || []).length;
  const kanjiCount = (text.match(KANJI_PATTERN) || []).length;
  const hangulCount = (text.match(HANGUL_PATTERN) || []).length;
  
  const japaneseCount = hiraganaCount + katakanaCount + kanjiCount;
  
  // Need significant presence (at least 5 characters or 1% of text)
  const threshold = Math.max(5, text.length * 0.01);
  
  if (japaneseCount >= threshold) {
    return { language: "ja", confidence: "high" };
  }
  
  if (hangulCount >= threshold) {
    return { language: "ko", confidence: "high" };
  }
  
  if (cyrillicCount >= threshold) {
    return { language: "sr", confidence: "high" }; // Cyrillic = Serbian
  }
  
  return null;
}

/**
 * Detect language by word markers for Latin-script languages
 */
export function detectByMarkers(text: string): { language: string; confidence: "high" | "medium" } | null {
  const scores: Record<string, number> = {};
  
  for (const [lang, patterns] of Object.entries(LANGUAGE_MARKERS)) {
    let matchCount = 0;
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      matchCount += matches?.length || 0;
    }
    scores[lang] = matchCount;
  }
  
  // Find highest and second highest
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  
  if (sorted.length === 0 || sorted[0][1] < 3) {
    return null; // Not enough markers
  }
  
  const [topLang, topScore] = sorted[0];
  const secondScore = sorted[1]?.[1] || 0;
  
  // High confidence if top score is >2x second score
  if (topScore > secondScore * 2 && topScore >= 10) {
    return { language: topLang, confidence: "high" };
  }
  
  if (topScore >= 5) {
    return { language: topLang, confidence: "medium" };
  }
  
  return null;
}

/**
 * Extract a detection sample from lyrics (Verse 1 + Chorus, ~1500-2000 chars)
 */
export function extractDetectionSample(lyrics: string): string {
  const sections = lyrics.split(/\[(?:Verse|Chorus|Bridge|Intro|Outro|Final Chorus)/i);
  
  // Try to get Verse 1 and Chorus
  let sample = "";
  
  // Look for [Verse 1] and [Chorus]
  const verse1Match = lyrics.match(/\[Verse 1?\]([\s\S]*?)(?=\[|$)/i);
  const chorusMatch = lyrics.match(/\[Chorus\]([\s\S]*?)(?=\[|$)/i);
  
  if (verse1Match) sample += verse1Match[1];
  if (chorusMatch) sample += chorusMatch[1];
  
  // If we didn't get enough, just use first 2000 chars
  if (sample.length < 500) {
    sample = lyrics.substring(0, 2000);
  }
  
  return sample.substring(0, 2000);
}

/**
 * Main language detection orchestrator - tiered approach
 */
export function runLanguageDetection(lyrics: string, requestedCode: string): DetectionResult {
  const sample = extractDetectionSample(lyrics);
  const issues: string[] = [];
  
  // Step 1: Script detection (ja, ko, sr Cyrillic)
  const scriptResult = detectByScript(sample);
  if (scriptResult) {
    return {
      detected_language: scriptResult.language,
      confidence: scriptResult.confidence,
      matches_requested: scriptResult.language === requestedCode,
      method: "script",
      issues: scriptResult.language !== requestedCode 
        ? [`Script detection found ${getLanguageLabel(scriptResult.language)}, expected ${getLanguageLabel(requestedCode)}`]
        : [],
      detection_sample: sample.substring(0, 300),
    };
  }
  
  // Step 2: Serbian/Croatian Latin script validation
  // For sr/hr with Latin script, trust the user's explicit choice
  if (requestedCode === "sr" || requestedCode === "hr") {
    const markerResult = detectByMarkers(sample);
    
    // If markers suggest it's Slavic (sr or hr), accept user's choice
    if (markerResult && (markerResult.language === "sr" || markerResult.language === "hr")) {
      return {
        detected_language: requestedCode,
        confidence: "high",
        matches_requested: true,
        method: "explicit_user_choice",
        issues: ["Language accepted based on user selection (Latin script ambiguity)"],
        detection_sample: sample.substring(0, 300),
      };
    }
    
    // Check if it looks Slavic even if markers didn't fire strongly
    const slavicPatterns = /\b(sam|ali|jer|kada|što|ima|nije|može|mora|bilo|samo)\b/gi;
    const slavicMatches = (sample.match(slavicPatterns) || []).length;
    
    if (slavicMatches >= 3) {
      return {
        detected_language: requestedCode,
        confidence: "high",
        matches_requested: true,
        method: "explicit_user_choice",
        issues: ["Language accepted based on user selection (Latin script ambiguity)"],
        detection_sample: sample.substring(0, 300),
      };
    }
  }
  
  // Step 3: Marker detection for other Latin-script languages
  const markerResult = detectByMarkers(sample);
  if (markerResult) {
    return {
      detected_language: markerResult.language,
      confidence: markerResult.confidence,
      matches_requested: markerResult.language === requestedCode,
      method: "markers",
      issues: markerResult.language !== requestedCode 
        ? [`Marker detection found ${getLanguageLabel(markerResult.language)}, expected ${getLanguageLabel(requestedCode)}`]
        : [],
      detection_sample: sample.substring(0, 300),
    };
  }
  
  // Step 4: Default - couldn't detect confidently
  return {
    detected_language: requestedCode,
    confidence: "low",
    matches_requested: true, // Assume correct if we can't tell
    method: "markers",
    issues: ["Could not confidently detect language, assuming requested language is correct"],
    detection_sample: sample.substring(0, 300),
  };
}

// ============= MIXED LANGUAGE CHECK =============

/**
 * Check for mixed-language output (>20% foreign lines)
 * Returns true if check passes (not too mixed), false if it fails
 */
export function checkMixedLanguage(lyrics: string, targetCode: string): { passed: boolean; foreignPercentage: number; issues: string[] } {
  const lines = lyrics.split("\n")
    .map(l => l.trim())
    .filter(l => {
      // Skip empty lines, section headers, and very short lines
      if (!l || l.startsWith("[") || l.length < 3) return false;
      // Skip lines that are 2 words or fewer
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
  
  // For each line, detect its language
  let foreignLineCount = 0;
  
  for (const line of lines) {
    const detection = detectByMarkers(line);
    if (detection && detection.language !== targetCode && detection.language !== "en" && targetCode !== "en") {
      // Only count as foreign if it's not English (English hooks are common)
      foreignLineCount++;
    } else if (detection && detection.language === "en" && targetCode !== "en") {
      // English in a non-English song
      foreignLineCount++;
    }
  }
  
  const foreignPercentage = foreignLineCount / lines.length;
  
  if (foreignPercentage > MIXED_LANGUAGE_THRESHOLD) {
    return {
      passed: false,
      foreignPercentage,
      issues: [`Mixed language detected: ${Math.round(foreignPercentage * 100)}% of lines appear to be in a different language`],
    };
  }
  
  return { passed: true, foreignPercentage, issues: [] };
}

// ============= QA RESULT INTERFACE =============

export interface LanguageQAResult {
  attempt: 1 | 2;
  passed: boolean;
  detection: DetectionResult;
  mixed_language_check?: { passed: boolean; foreignPercentage: number };
  fluency_score?: number;
  issues: string[];
  timestamp: string;
}

/**
 * Run full QA on generated lyrics
 */
export function runBasicQA(lyrics: string, requestedCode: string, attempt: 1 | 2): LanguageQAResult {
  const issues: string[] = [];
  let passed = true;
  
  // 1. Language detection
  const detection = runLanguageDetection(lyrics, requestedCode);
  
  if (!detection.matches_requested && detection.confidence !== "low") {
    passed = false;
    issues.push(...detection.issues);
  }
  
  // 2. Mixed language check
  const mixedCheck = checkMixedLanguage(lyrics, requestedCode);
  if (!mixedCheck.passed) {
    passed = false;
    issues.push(...mixedCheck.issues);
  }
  
  // Note: Fluency check would require LLM call, handled separately
  
  return {
    attempt,
    passed,
    detection,
    mixed_language_check: {
      passed: mixedCheck.passed,
      foreignPercentage: mixedCheck.foreignPercentage,
    },
    issues,
    timestamp: new Date().toISOString(),
  };
}

// ============= PROMPT BUILDER =============

/**
 * Build the language-aware prompt block for lyrics generation
 */
export function buildLanguagePromptBlock(languageCode: string): string {
  if (languageCode === "en") {
    return ""; // No special instructions for English
  }
  
  const label = getLanguageLabel(languageCode);
  const rules = getLanguageSpecificRules(languageCode);
  
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
}

/**
 * Build a stronger retry prompt when first attempt fails QA
 */
export function buildRetryLanguagePromptBlock(languageCode: string, issues: string[]): string {
  const label = getLanguageLabel(languageCode);
  const baseBlock = buildLanguagePromptBlock(languageCode);
  
  return `${baseBlock}

## CRITICAL: Previous attempt failed language QA

The previous attempt had these issues:
${issues.map(i => `- ${i}`).join("\n")}

You MUST fix these issues in this attempt:
- Write ONLY in ${label} - no English words or phrases
- Ensure natural ${label} phrasing, not translated English
- Do not include any English hooks or phrases
- If you cannot write in ${label}, respond with "CANNOT_GENERATE_IN_LANGUAGE"`;
}
