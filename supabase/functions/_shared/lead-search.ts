// Shared, pure helpers for the admin Leads server-side search.
//
// The admin Leads tab used to download every lead row and filter in the
// browser. These helpers let the `list` action push the same search to
// Postgres instead. Everything here is pure so it can be unit tested without
// a database or network.

/** Columns the admin lead search matches, mirroring the old client-side filter. */
export const LEAD_SEARCH_TEXT_COLUMNS = [
  "email",
  "customer_name",
  "recipient_name",
  "genre",
  "occasion",
  "singer_preference",
  "special_qualities",
  "favorite_memory",
  "special_message",
  "preview_song_url",
  "preview_token",
  "cover_image_url",
] as const;

export const MAX_SEARCH_TERM_LENGTH = 120;

const FULL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_PREFIX = /^[0-9a-f]{6,8}$/i;

/**
 * Normalizes a raw admin search box value.
 *
 * - Accepts a pasted preview/song link and extracts the token.
 * - Strips control characters (including NUL, which Postgres text cannot hold).
 * - Collapses whitespace and caps length.
 */
export function normalizeLeadSearchTerm(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const urlMatch = raw.match(/\/(?:preview|song)\/([A-Za-z0-9_-]+)/);
  const base = urlMatch ? urlMatch[1] : raw;
  return base
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH_TERM_LENGTH);
}

/**
 * Escapes a term for use inside a PostgREST `ilike` pattern.
 *
 * Two separate escaping layers matter here:
 *  1. SQL LIKE wildcards (`%`, `_`) and its escape character (`\`) must be
 *     neutralised so a term like `50%_off` is matched literally.
 *  2. PostgREST's own filter grammar — the value is wrapped in double quotes
 *     by `buildLeadSearchOrFilter`, so `"` must be escaped, and `*` (which
 *     PostgREST translates into `%`) is dropped.
 */
export function escapeIlikePattern(term: string): string {
  return term
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/\*/g, "")
    .replace(/"/g, '\\"');
}

/**
 * Builds the PostgREST `.or(...)` filter string for a normalized term, or null
 * when the term is empty (caller must then not filter at all).
 */
export function buildLeadSearchOrFilter(term: string): string | null {
  const normalized = normalizeLeadSearchTerm(term);
  if (!normalized) return null;
  const pattern = `%${escapeIlikePattern(normalized)}%`;
  return LEAD_SEARCH_TEXT_COLUMNS.map((col) => `${col}.ilike."${pattern}"`).join(",");
}

/**
 * Admins routinely search by the short lead ID shown in the UI (first 8 hex
 * characters of the uuid) or by a full uuid. `ilike` cannot be applied to a
 * uuid column through PostgREST, so translate those into index-friendly
 * equality / range bounds instead.
 */
export function buildLeadIdMatch(
  term: string,
): { type: "eq"; value: string } | { type: "range"; gte: string; lte: string } | null {
  const normalized = normalizeLeadSearchTerm(term).toLowerCase();
  if (FULL_UUID.test(normalized)) {
    return { type: "eq", value: normalized };
  }
  if (HEX_PREFIX.test(normalized)) {
    const prefix = normalized.padEnd(8, "0");
    const prefixHigh = normalized.padEnd(8, "f");
    return {
      type: "range",
      gte: `${prefix}-0000-0000-0000-000000000000`,
      lte: `${prefixHigh}-ffff-ffff-ffff-ffffffffffff`,
    };
  }
  return null;
}

/** Merges rows from the text search and the id search, de-duplicating by id. */
export function mergeLeadMatches<T extends { id: string }>(...groups: (T[] | null | undefined)[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const group of groups) {
    for (const row of group ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}
