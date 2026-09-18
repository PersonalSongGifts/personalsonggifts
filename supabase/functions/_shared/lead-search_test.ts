import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildLeadIdMatch,
  buildLeadSearchOrFilter,
  escapeIlikePattern,
  LEAD_SEARCH_TEXT_COLUMNS,
  MAX_SEARCH_TERM_LENGTH,
  mergeLeadMatches,
  normalizeLeadSearchTerm,
} from "./lead-search.ts";

Deno.test("normalize: trims, collapses whitespace, caps length", () => {
  assertEquals(normalizeLeadSearchTerm("  renedarwent  "), "renedarwent");
  assertEquals(normalizeLeadSearchTerm("rene   darwent"), "rene darwent");
  assertEquals(normalizeLeadSearchTerm("x".repeat(500)).length, MAX_SEARCH_TERM_LENGTH);
  assertEquals(normalizeLeadSearchTerm(null), "");
  assertEquals(normalizeLeadSearchTerm(42), "");
});

Deno.test("normalize: strips control characters including NUL", () => {
  assertEquals(normalizeLeadSearchTerm("re\u0000ne\u001fdar"), "re ne dar");
});

Deno.test("normalize: extracts token from a pasted preview or song link", () => {
  assertEquals(
    normalizeLeadSearchTerm("https://www.personalsonggifts.com/preview/L3pZGpC2JdJyTGAe?followup=true"),
    "L3pZGpC2JdJyTGAe",
  );
  assertEquals(normalizeLeadSearchTerm("/song/ABCdef123"), "ABCdef123");
});

Deno.test("escape: neutralises LIKE wildcards, backslash, quotes, and star", () => {
  assertEquals(escapeIlikePattern("50%_off"), "50\\%\\_off");
  assertEquals(escapeIlikePattern("a\\b"), "a\\\\b");
  assertEquals(escapeIlikePattern('say "hi"'), 'say \\"hi\\"');
  assertEquals(escapeIlikePattern("a*b"), "ab");
});

Deno.test("or-filter: covers every documented column and quotes the value", () => {
  const filter = buildLeadSearchOrFilter("renedarwent")!;
  const parts = filter.split(",");
  assertEquals(parts.length, LEAD_SEARCH_TEXT_COLUMNS.length);
  for (const col of LEAD_SEARCH_TEXT_COLUMNS) {
    assert(parts.includes(`${col}.ilike."%renedarwent%"`), `missing ${col}`);
  }
});

Deno.test("or-filter: story phrases with commas and parens stay inside one quoted value", () => {
  const filter = buildLeadSearchOrFilter("walks on Chancellor hill, just us (always)")!;
  // 12 columns -> 12 segments even though the term itself contains a comma.
  assertEquals(filter.split('.ilike."').length - 1, LEAD_SEARCH_TEXT_COLUMNS.length);
  assert(filter.includes('%walks on Chancellor hill, just us (always)%'));
});

Deno.test("or-filter: empty / whitespace term yields null (no filtering)", () => {
  assertEquals(buildLeadSearchOrFilter(""), null);
  assertEquals(buildLeadSearchOrFilter("   "), null);
  assertEquals(buildLeadSearchOrFilter(undefined as unknown as string), null);
});

Deno.test("id match: full uuid uses equality", () => {
  assertEquals(buildLeadIdMatch("4F21B8DE-746B-4E22-8D9F-B434A1E2BFD6"), {
    type: "eq",
    value: "4f21b8de-746b-4e22-8d9f-b434a1e2bfd6",
  });
});

Deno.test("id match: short id prefix becomes a uuid range", () => {
  const m = buildLeadIdMatch("4f21b8de") as { type: "range"; gte: string; lte: string };
  assertEquals(m.type, "range");
  assertEquals(m.gte, "4f21b8de-0000-0000-0000-000000000000");
  assertEquals(m.lte, "4f21b8de-ffff-ffff-ffff-ffffffffffff");
  assert("4f21b8de-746b-4e22-8d9f-b434a1e2bfd6" > m.gte);
  assert("4f21b8de-746b-4e22-8d9f-b434a1e2bfd6" < m.lte);
});

Deno.test("id match: non-hex terms and emails are not treated as ids", () => {
  assertEquals(buildLeadIdMatch("renedarwent@gmail.com"), null);
  assertEquals(buildLeadIdMatch("rene"), null);
  assertEquals(buildLeadIdMatch("L3pZGpC2JdJyTGAe"), null);
});

Deno.test("merge: de-duplicates by id and preserves first-seen order", () => {
  const merged = mergeLeadMatches(
    [{ id: "a" }, { id: "b" }],
    [{ id: "b" }, { id: "c" }],
    null,
    undefined,
  );
  assertEquals(merged.map((r) => r.id), ["a", "b", "c"]);
});
