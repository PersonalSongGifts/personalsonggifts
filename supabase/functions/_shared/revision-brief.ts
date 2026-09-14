// Structured, bounded propagation of customer revision notes into generation.
//
// Problem this solves: submit-revision persisted `style_notes`, `tempo` and
// `anything_else` into `revision_requests` only. Leads have no `notes` column at
// all, so for leads those fields reached NOTHING; for orders they were merged
// into `notes` and only ever read by the lyrics prompt — the audio style prompt
// ignored tempo entirely.
//
// Everything here is pure except `fetchLatestRevisionBrief`, which does a single
// read of the most recent approved/pending revision request for the entity.

export interface RevisionBrief {
  style_notes: string | null;
  tempo: string | null;
  anything_else: string | null;
}

export const BRIEF_LIMITS = {
  style_notes: 500,
  tempo: 60,
  anything_else: 500,
  /** Suno's style field is short; keep the appended direction tight. */
  audio_style_suffix: 200,
} as const;

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

/**
 * Audio-stage suffix appended to the Suno style prompt so tempo/style requests
 * actually influence the recording instead of being dropped.
 */
export function buildAudioStyleSuffix(brief: RevisionBrief): string {
  const parts: string[] = [];
  if (brief.tempo) parts.push(`tempo: ${brief.tempo}`);
  if (brief.style_notes) parts.push(brief.style_notes);
  if (!parts.length) return "";
  return `. ${parts.join(". ")}`.slice(0, BRIEF_LIMITS.audio_style_suffix);
}

interface MinimalDb {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        in: (col: string, vals: string[]) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => {
              maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
            };
          };
        };
      };
    };
  };
}

/** Latest approved/pending revision request for a lead or order. Never throws. */
export async function fetchLatestRevisionBrief(
  db: MinimalDb,
  entityType: "lead" | "order",
  entityId: string,
): Promise<RevisionBrief> {
  try {
    const { data } = await db
      .from("revision_requests")
      .select("style_notes, tempo, anything_else, submitted_at")
      .eq(entityType === "order" ? "order_id" : "lead_id", entityId)
      .in("status", ["approved", "pending"])
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return normalizeRevisionBrief(data);
  } catch (_e) {
    return normalizeRevisionBrief(null);
  }
}
