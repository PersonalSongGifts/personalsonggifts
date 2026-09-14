// Typed pronunciation handling.
//
// Review blocker: customers type prose into the pronunciation field ("Dionne,
// pronounced Di-on", "it's DEE-on not Dionne"). That prose was previously used
// as-is, which risks the whole sentence being sung, or the phonetic spelling
// replacing the real name in the display/title.
//
// Rules enforced here:
//  - the DISPLAY name is never altered by anything in the pronunciation field;
//  - prose is parsed into a typed { name, phonetic } instruction;
//  - the phonetic form is only ever emitted as an instruction line for the
//    lyrics prompt, never as a value to be written into a name field.

export interface PronunciationHint {
  /** The name this hint is about, spelled the way the customer writes it. */
  displayName: string;
  /** How to say it. Never used as a display value. */
  phonetic: string | null;
  /** True when we had to parse prose rather than a clean phonetic spelling. */
  parsedFromProse: boolean;
}

const PROSE_MARKERS = [
  /\bpronoun\w*\s*(?:as|like|:)?\s*/i,
  /\bsounds?\s+like\s*/i,
  /\bsay(?:\s+it)?\s+(?:as|like)?\s*/i,
  /\bit'?s\s+/i,
  /\brhymes?\s+with\s*/i,
];

const MAX_PHONETIC = 60;

function tidy(value: string): string {
  return value
    .replace(/https?:\/\/[^\s]+/gi, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^["'“”‘’\s.,:;-]+|["'“”‘’\s.,:;-]+$/g, "")
    .trim();
}

/**
 * Extract a typed hint from whatever the customer typed.
 * `displayName` always comes from the record, never from the hint text.
 */
export function parsePronunciation(displayName: string, raw: string | null | undefined): PronunciationHint {
  const text = tidy(String(raw ?? ""));
  if (!text) return { displayName, phonetic: null, parsedFromProse: false };

  // A bare phonetic spelling: short, no sentence structure.
  const looksBare = !/\s(?:is|as|like|not|pronounce\w*|says?|sounds?)\b/i.test(text) && text.split(/\s+/).length <= 3;
  if (looksBare) {
    return { displayName, phonetic: text.slice(0, MAX_PHONETIC), parsedFromProse: false };
  }

  for (const marker of PROSE_MARKERS) {
    const match = text.match(marker);
    if (match && match.index !== undefined) {
      const after = tidy(text.slice(match.index + match[0].length));
      // Take the phonetic token(s) up to a clause break.
      const candidate = tidy(after.split(/\bnot\b|,|;|\.|\bbut\b/i)[0] ?? "");
      if (candidate) {
        return { displayName, phonetic: candidate.slice(0, MAX_PHONETIC), parsedFromProse: true };
      }
    }
  }

  // Unparseable prose: keep it as an instruction, bounded, but flagged so we
  // never treat it as a spelling.
  return { displayName, phonetic: text.slice(0, MAX_PHONETIC), parsedFromProse: true };
}

/**
 * Instruction block for the lyrics prompt. Explicitly separates "how to say it"
 * from "how to write it" so the phonetic form cannot leak into the sung name
 * spelling or the song title.
 */
export function buildPronunciationBlock(hint: PronunciationHint): string {
  if (!hint.phonetic) return "";
  return `\n\n# NAME PRONUNCIATION
- Write the name as "${hint.displayName}" everywhere it appears. Never change this spelling.
- It is pronounced "${hint.phonetic}". Choose phrasing and rhymes that fit that pronunciation.
- Do not put the pronunciation spelling, or this instruction, into the lyrics or the title.`;
}

/**
 * Display value is ALWAYS the stored name. Guard used where a name is written
 * back to a record or rendered, so prose can never become the name.
 */
export function safeDisplayName(displayName: string, _pronunciation: string | null | undefined): string {
  return displayName;
}
