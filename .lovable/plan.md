

## Build `/share-reaction` — Emotional, Mobile-First Reaction Video Page

### Changes

#### 1. Edge Function: `supabase/functions/upload-reaction/index.ts`

Add a `direct-upload` action in the existing FormData handler. Changes:

- Increase `MAX_VIDEO_SIZE` to 150MB
- Remove `.avi` from allowed types (spec says mp4/quicktime/webm only)
- When `action === "direct-upload"`:
  - Extract `name`, `email`, `orderId` (optional), `video` from FormData
  - Validate video (size, type, extension) — same existing logic
  - **Rate limit**: count recent uploads by email in last 24h using a query on `orders.reaction_submitted_at` + a simple in-memory approach (or query reactions bucket listing). For simplicity, query orders where `customer_email ilike email` and `reaction_submitted_at` within last 24h, limit 3.
  - **Order linking logic**:
    - If `orderId` provided: validate it belongs to the email, link reaction to that order
    - If no `orderId`: query delivered orders for that email
      - Exactly 1 → auto-link
      - 0 → upload file with UUID-based filename, log as unlinked (no DB update since no order to update)
      - 2+ → upload file with UUID-based filename, log as `needs_manual_match`
  - Filename: `{crypto.randomUUID()}-{timestamp}.ext` (never use email)
  - Upload to `reactions` bucket, get public URL
  - If linked to an order: update `reaction_video_url` and `reaction_submitted_at` on that order (same verified pattern with rollback)
  - If unlinked: log structured event with email, name, filename for manual review
  - Return `{ success: true }`

#### 2. New Page: `src/pages/ShareReaction.tsx`

Self-contained page (no Layout wrapper). Mobile-first vertical scroll. `#FDF8F3` background, `#1E3A5F` headings.

**Minimal header**: Brand name "PersonalSongGifts" + small "Need help? support@personalsonggifts.com" link.

**Sections (all visible on scroll):**

1. **Hero** — "Share Your Reaction Video" headline, warm subtext about hearing a personalized song for the first time, small heart icon
2. **Why We're Asking** — 2-3 sentences about being a small team, real reactions helping others discover personalized songs
3. **How It Works** — 3 numbered steps (upload → may be featured → $100 gift card drawing)
4. **Video Tips** — Bullet list: vertical preferred, phone is fine, capture the realization moment, 30s–2min ideal. "No editing required. Authentic moments are best."
5. **Form** — Single view, all fields visible:
   - Name (required)
   - Email (required)
   - Order number (optional, helper: "Don't worry if you don't have it")
   - Video upload (large tap area, drag-drop + tap, progress bar, microcopy: "Phone video is perfect. No editing needed.")
   - Consent checkbox
   - Submit button
   - Fallback: "If upload fails, email your video to support@personalsonggifts.com"
6. **Thank You** — Replaces entire page on success. "Thank you for sharing your moment with us."

**Client-side validation**: max 150MB, video/* only, all required fields, consent checked.

#### 3. Route: `src/App.tsx`

Add `/share-reaction` route pointing to `ShareReaction`.

### Files

| Action | File |
|--------|------|
| Modify | `supabase/functions/upload-reaction/index.ts` |
| Create | `src/pages/ShareReaction.tsx` |
| Modify | `src/App.tsx` |

