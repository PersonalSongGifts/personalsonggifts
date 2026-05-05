# Restore Previous Versions + Fix Missing Button

## What's actually happening

I pulled both records and traced exactly what went wrong. They are **two different bugs** that look the same on the surface ("no Restore Previous Version button").

### Order 1 — BCB897CC (Michael Harrison / Ashley)
- Came in as a **lead conversion** on May 2 with a fully generated lead song.
- Customer immediately submitted a self-service revision → auto-approved → song was regenerated.
- The new song was delivered May 3.
- **`prev_song_url` is empty** in the DB.

**Root cause:** When the auto-approved revision regenerated the song, `backupSongFile()` runs in `admin-orders` (the snapshot helper). But for this order, the original lead song lived on the **lead row** (`leads.full_song_url`) and was *never copied to `orders.song_url` at conversion time* with a snapshot path the backup helper recognizes. The backup helper looks at `orders.song_url` and tries to derive a `-prev` path; if the URL points at a `leads/` storage path (not the canonical order path), the snapshot can fail silently and `prev_song_url` stays null. Result: button hidden because the UI gates on `selectedOrder.prev_song_url`.

The lead row still has the original lead song intact (`leads/7197A807-full.mp3` equivalent) → **we can recover it**.

### Order 2 — 0596AA4A (Mahmoud / Jana)
- Came in as a **direct Stripe checkout** (not a lead conversion — `source='direct'`, customer paid cold).
- Order has **no song at all** (`song_url`, `automation_lyrics` both null) and `automation_status` is null — automation never ran.
- There IS a matching lead with the exact same email + recipient name + a fully generated song (`leads/7197A807-full.mp3`, lyrics 3,728 chars), captured 1 minute before checkout.
- The lead and the order have **different `inputs_hash` values** (lead: `741180b8…`, order: `c24e7e97…`), so the webhook's lead-conversion fingerprint match did NOT fire. The lead and order are two separate rows that were never linked.

**Root cause:** `inputs_hash` mismatch between the create-lead path and the create-order path (likely a normalization difference — trimming, casing, or one of the optional fields differs by a single character). Because the hashes don't match, the webhook treats the order as a fresh "direct" order and queues automation from scratch; meanwhile the lead's pre-generated assets sit unused. There's no `prev_song_url` because there was never a "previous" — the order has no song at all yet.

This is the same class of bug we hardened against last week, but the fingerprint fallback only catches the `lead_session:` Stripe path. The pure `stripe_session:` path with a hash mismatch falls through.

---

## Plan

### Step 1 — Hand-restore both customers right now

**Order BCB897CC (Michael):**
- Copy the lead's original song file (`leads/14688E56-full.mp3` style path) into the order's `-prev` slot in storage.
- Set `orders.prev_song_url`, `prev_automation_lyrics`, `prev_cover_image_url` to point at the lead's pre-revision assets pulled from the lead row.
- Add an `order_activity_log` entry: `prev_version_recovered, actor=admin, "Manually restored lead-original snapshot for restore button"`.
- Result: the **Restore Previous Version** button appears in admin for that order, and CS can one-click revert.

**Order 0596AA4A (Mahmoud):**
- Copy the lead's full song + lyrics + cover onto the order directly (`song_url`, `automation_lyrics`, `cover_image_url`, `song_title`, `automation_status='completed'`, `status='delivered'`, `delivered_at=now()`, `generated_at=lead.generated_at`).
- Also seed `prev_song_url`/`prev_automation_lyrics`/`prev_cover_image_url` to the same values, so the customer has a snapshot if they later revise.
- Mark the lead `status='converted'`, `order_id=0596AA4A` (it's currently still `converted` to that order — confirm linkage).
- Trigger `send-song-delivery` for the order so the customer finally gets their delivery email (it was never sent — no `delivery_sent` log entry).
- Add activity log entry explaining the manual lead→order asset copy.

### Step 2 — Fix the root causes so this stops happening

**Fix A — Always snapshot at lead-conversion time (covers Bug #1):**
In `supabase/functions/_shared/lead-conversion.ts → buildLeadAssetPatch`, when copying `full_song_url` onto the order, **also write the same value to `prev_song_url`** (and lyrics/cover to their `prev_*` counterparts). This guarantees that for every lead-converted order, the original lead song is permanently recoverable via the existing Restore Previous Version button — even if the customer later revises and the snapshot helper fails.

**Fix B — Reduce snapshot-helper silent failures (covers Bug #1, defense in depth):**
In `admin-orders/index.ts → backupSongFile`, when the URL doesn't match the expected `songs/` bucket prefix (e.g. lead path), instead of returning `{backed_up:false}` quietly, fall back to writing `prev_song_url = currentSongUrl` directly (no file copy needed — the lead file already lives in storage permanently). Log a warning. This means even pre-fix orders going through revision will preserve a usable `prev_song_url`.

**Fix C — Hash-mismatch fallback for direct Stripe orders (covers Bug #2):**
In `stripe-webhook/index.ts`, on the `stripe_session:` (direct checkout) path, if no order is created from a prior lead and `inputs_hash` doesn't find a match, run a **secondary fingerprint match**: look up unconverted leads by `(lower(email), lower(recipient_name), recipient_type, occasion)` captured within the last 24h that have `full_song_url`. If exactly one match, treat it as a lead conversion: copy assets via `buildLeadAssetPatch`, mark lead converted, link `order_id`, fire delivery. Log to activity feed. Single-match-only to avoid wrong attribution.

**Fix D — Extend monitor:**
Update `monitor-missing-assets/index.ts` to also flag any **paid order with no `automation_status` after 30 minutes** when there's an unconverted lead in the same time window with the same email. That's the exact signature of Bug #2 and would have alerted us within the hour.

### Step 3 — Backfill sweep (one-time)
Run a one-shot SQL/script over the last 30 days to find:
- Lead-converted orders where `prev_song_url IS NULL` but the matching lead has `full_song_url` → backfill `prev_*` columns.
- Paid orders with no song where a same-email same-recipient lead has a complete song → flag for CS review (don't auto-attach old ones, just produce a list).

I'll print the count before doing any writes so you can confirm.

---

## Technical details (reference)

- Affected files for code fixes: `supabase/functions/_shared/lead-conversion.ts`, `supabase/functions/stripe-webhook/index.ts`, `supabase/functions/admin-orders/index.ts` (`backupSongFile`), `supabase/functions/monitor-missing-assets/index.ts`.
- DB writes for the two manual restores: targeted UPDATEs on `orders` + `leads` + a storage copy for BCB897CC's `-prev` slot. No schema migration needed.
- UI: no changes — the existing `selectedOrder.prev_song_url && (...)` gate at `Admin.tsx:2458` will start rendering automatically once the columns are populated.
- The "Restore Previous Version" handler at `Admin.tsx:879` already calls `admin-orders` with `action: "restore_previous_version"` which swaps `prev_*` → live and clears `prev_*`. Works as-is.

## Out of scope
- Refactoring `inputs_hash` to be tolerant of formatting differences. That's the deeper fix for Bug #2 but high risk; the secondary-fingerprint fallback in Fix C is safer and catches the same cases in practice.
- Self-service "Restore" for customers (currently admin-only). Not asked for.

Approve and I'll execute Step 1 first (the two customers), then Step 2 fixes, then Step 3 backfill.
