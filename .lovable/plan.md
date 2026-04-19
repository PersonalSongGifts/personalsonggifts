

## Plan: Admin "Grant Extra Revision" + Tempo question (already wired)

### Part 1 — Grant Extra Revision (admin action)

**Where it lives:** the "Revision Status" section of the order detail panel in `CSAssistant.tsx` (and the matching panel in `LeadsTable.tsx` for leads, since leads also have `max_revisions`/`revision_count`).

**UX:**
- When `revision_count >= max_revisions` and `revision_status` is `null` / `approved` / `rejected` (i.e. customer used their free one), show a small **"Grant +1 Revision"** button next to the "X/Y used" counter.
- Clicking it opens a tiny confirm dialog with an optional reason note ("CS comp", "chargeback resolved", etc., logged to activity log).
- On confirm: bumps `max_revisions` by 1, leaves `revision_count` alone. The customer's existing revision link (`/song/revision/:token`) immediately re-opens — `get-revision-page` already gates on `revision_count < max_revisions`, so no other code changes needed.
- After granting, button becomes a small "Granted +1 (now X total)" label so it's obvious it was used.

**Backend:** new `body.action === "grant_extra_revision"` branch in `supabase/functions/admin-orders/index.ts` that:
1. Loads the row from `orders` or `leads` (param `entityType`, `entityId`).
2. `max_revisions = (max_revisions ?? 1) + 1`.
3. Writes one `order_activity_log` entry: `revision_grant`, actor=`admin`, details=optional reason.

**Customer-side resend (optional, asked below):** after granting, optionally email the customer their existing revision link with a short note ("We've added another revision for you — here's your link"). This reuses the same revision URL we already email post-delivery.

### Part 2 — Tempo field in the revision form

**Good news: it already exists.** The customer-facing revision form at `/song/revision/:token` already has fields for **Style / Vibe Changes**, **Anything Else**, and supports a **`tempo`** field end-to-end in the database (`revision_requests.tempo`) and in `submit-revision`.

What's missing is just the **UI input** for tempo on the page — the rest of the pipeline already handles it.

**UX add (tiny):** add a Select between "Style / Vibe Changes" and "Anything Else" with options:
- "Same tempo" (empty/default)
- "A bit slower"
- "A bit faster"
- "Much slower"
- "Much faster"

### How tempo reaches Suno today

I traced the pipeline so you know exactly what happens when a customer picks "A bit faster":

1. **`submit-revision`** writes `tempo: "A bit faster"` into `revision_requests`. On approve (manual or auto), it appends it to the order's `notes` field as `"tempo: A bit faster"` and triggers a regeneration.
2. **`automation-generate-lyrics`** reads `entity.notes` and merges it with `sender_context` into a `SenderContext` block in the Gemini prompt. Gemini then naturally inserts bracketed performance directions like `[upbeat tempo]` or `[slower groove, gentle pace]` into the lyrics.
3. Suno reads those bracketed cues from the lyrics body and **does** respond to them (this is the same channel used today for instrumental directions — e.g. `[Tempo slows]` is explicitly called out in the lyrics-generation system prompt as a valid direction).

**Will it break anything? No.**
- Tempo is already an accepted column, validated as a "short field" in `submit-revision`, and already counted as a `contentField` that triggers regeneration. Adding the UI input flips on a path that's already hot.
- Suno controls tempo via the genre/style prompt + bracketed cues in lyrics, **not** via a numeric BPM parameter. So we get qualitative control ("a bit faster") but not exact BPM. That matches Suno's actual capability — there is no public BPM knob.
- Risk surface: zero new DB columns, zero edge-function deploys for the tempo UI itself (the backend already accepts it). The only deploy needed is `admin-orders` for the grant action.

### Files I'll touch

**Edge:**
- `supabase/functions/admin-orders/index.ts` — add `grant_extra_revision` action.

**Admin UI:**
- `src/components/admin/CSAssistant.tsx` — add "Grant +1 Revision" button + confirm dialog in the Revision Status section.
- `src/components/admin/LeadsTable.tsx` — same button on the lead detail dialog (leads also have revision counters).

**Customer UI:**
- `src/pages/SongRevision.tsx` — insert the Tempo `<Select>` between Style Notes and Anything Else.

### Two quick questions before I build

1. **After "Grant +1 Revision", should we auto-email the customer their revision link**, or just unlock it silently and let CS message them manually?
2. **Tempo options** — keep the 5 I proposed (Same / a bit slower / a bit faster / much slower / much faster), or you want a free-text input instead?

