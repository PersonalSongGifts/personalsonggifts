// Structured, bounded propagation of customer revision notes into generation.
//
// Problem this solves: submit-revision persisted `style_notes`, `tempo` and
// `anything_else` into `revision_requests` only. Leads have no `notes` column at
// all, so for leads those fields reached NOTHING; for orders they were merged
// into `notes` and only ever read by the lyrics prompt — the audio style prompt
// ignored tempo entirely.
//
// Binding rules (review blockers 2 and 3):
//  - ONLY requests in status "approved" are readable. A request is promoted to
//    "approved" by submit-revision *after* it wins the atomic claim, and any
//    previously approved request is demoted to "superseded" in the same step, so
//    at most one approved request exists per record. A submission that loses a
//    concurrent race is never approved and can therefore never be read here.
//  - Lookup failures are reported, never swallowed. Callers must fail closed for
//    a record that is mid-revision instead of spending on a generation that
//    ignores the customer's instructions.

export interface RevisionBrief {
  style_notes: string | null;
  tempo: string | null;
  anything_else: string | null;
}

export interface RevisionBriefResult {
  /** false = the lookup itself failed; the brief is UNKNOWN, not empty. */
  ok: boolean;
  brief: RevisionBrief;
  /** id of the bound approved request, when one exists. */
  revisionRequestId: string | null;
  error: string | null;
}

export const BRIEF_LIMITS = {
  style_notes: 500,
  tempo: 60,
  anything_else: 500,
} as const;

export const EMPTY_BRIEF: RevisionBrief = { style_notes: null, tempo: null, anything_else: null };

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const stripped = value
    .replace(/https?:\/\/[^\s]+/gi, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!stripped) return null;
  return stripped.slice(0, max);
}

export function normalizeRevisionBrief(raw: Record<string, unknown> | null | undefined): RevisionBrief {
  return {
    style_notes: clean(raw?.style_notes, BRIEF_LIMITS.style_notes),
    tempo: clean(raw?.tempo, BRIEF_LIMITS.tempo),
    anything_else: clean(raw?.anything_else, BRIEF_LIMITS.anything_else),
  };
}

export function isEmptyBrief(brief: RevisionBrief): boolean {
  return !brief.style_notes && !brief.tempo && !brief.anything_else;
}

/**
 * Lyrics-stage block. Deliberately does NOT promise melody/tempo retention —
 * every revision is a fresh recording, and the prompt says so.
 */
export function buildLyricsBriefBlock(brief: RevisionBrief): string {
  if (isEmptyBrief(brief)) return "";
  const lines: string[] = [];
  if (brief.style_notes) lines.push(`- Style direction: "${brief.style_notes}"`);
  if (brief.tempo) lines.push(`- Requested tempo/feel: "${brief.tempo}"`);
  if (brief.anything_else) lines.push(`- Additional request: "${brief.anything_else}"`);
  return `\n\n# CUSTOMER CHANGE REQUEST (most recent)
The customer asked for these changes to their song. Honour them in the writing
where they affect words, mood, phrasing or pacing. This is a brand-new recording,
so do not attempt to reproduce any previous melody.
${lines.join("\n")}`;
}

export interface AudioStyleResult {
  style: string;
  /** Brief parts that did NOT fit the provider's style budget — never silently dropped. */
  dropped: string[];
}

/**
 * Appends the requested tempo/style direction to an existing provider style
 * string while respecting the model's TOTAL style budget (base style + language
 * note + suffix). Tempo has priority over free-text style notes. Anything that
 * does not fit is reported in `dropped` so the caller can log it instead of
 * silently truncating the customer's request mid-sentence.
 */
export function applyAudioStyleBrief(
  baseStyle: string,
  brief: RevisionBrief,
  maxTotalChars: number,
): AudioStyleResult {
  const parts: Array<{ key: string; text: string }> = [];
  if (brief.tempo) parts.push({ key: "tempo", text: `tempo: ${brief.tempo}` });
  if (brief.style_notes) parts.push({ key: "style_notes", text: brief.style_notes });

  let style = baseStyle.slice(0, maxTotalChars);
  const dropped: string[] = [];
  for (const part of parts) {
    const candidate = `${style}. ${part.text}`;
    if (candidate.length <= maxTotalChars) {
      style = candidate;
    } else {
      dropped.push(part.key);
    }
  }
  return { style, dropped };
}

interface MinimalDb {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        eq: (col: string, val: unknown) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
  };
}

/**
 * The single APPROVED revision request bound to this record, or an explicit
 * failure. Never throws, never silently downgrades an error to "no brief".
 */
export async function fetchBoundRevisionBrief(
  db: MinimalDb,
  entityType: "lead" | "order",
  entityId: string,
): Promise<RevisionBriefResult> {
  try {
    const { data, error } = await db
      .from("revision_requests")
      .select("id, style_notes, tempo, anything_else, submitted_at")
      .eq(entityType === "order" ? "order_id" : "lead_id", entityId)
      .eq("status", "approved")
      .order("submitted_at", { ascending: false })
      .limit(1);
    if (error) {
      return { ok: false, brief: EMPTY_BRIEF, revisionRequestId: null, error: error.message };
    }
    const row = (data || [])[0] ?? null;
    return {
      ok: true,
      brief: normalizeRevisionBrief(row),
      revisionRequestId: (row?.id as string | undefined) ?? null,
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      brief: EMPTY_BRIEF,
      revisionRequestId: null,
      error: e instanceof Error ? e.message : "unknown lookup failure",
    };
  }
}

/**
 * Fail-closed decision: a record whose revision is in flight MUST NOT be
 * generated while its brief is unknown, otherwise we spend money producing a
 * song that ignores the change the customer asked for.
 */
export function mustAbortForUnknownBrief(
  result: RevisionBriefResult,
  entity: { revision_status?: string | null },
): boolean {
  if (result.ok) return false;
  const s = String(entity.revision_status ?? "").toLowerCase();
  return s === "processing" || s === "pending";
}
