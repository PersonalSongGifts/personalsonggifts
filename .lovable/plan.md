

## Fix Short Song Duration + Improve Convert-to-Order Flow

### Problem 1: Songs generating too short (1:29 instead of 3–6 min)
The lyrics prompt says "target 3:00–3:30" but this is a soft suggestion. If the AI writes fewer/shorter sections, Suno produces a short song. There's no guardrail.

### Problem 2: Convert to Order doesn't notify the customer
After conversion, no email is sent — admin must manually resend delivery from the Orders tab.

---

### Changes

**1. `supabase/functions/automation-generate-lyrics/index.ts`** — Strengthen duration enforcement in the system prompt and user prompt:

- Add explicit minimum: "CRITICAL: The song MUST have enough lyrics for at least 3 minutes of audio. A typical 3-minute song needs 250-350 words of lyrics."
- Add word count validation after generation: if final lyrics are under 200 words, log a warning and add an extra verse/chorus via a follow-up AI call
- Add a `lyrics_word_count` field to the entity update so we can track this

**2. `supabase/functions/automation-suno-callback/index.ts`** — Add duration check when Suno returns:

- After receiving the audio URL, do a HEAD request or check Suno's returned duration metadata
- If duration < 150 seconds (2:30), set `automation_status` to `needs_review` instead of `completed`, with error message "Song too short ({duration}s), expected 180s+"
- This prevents auto-delivery of short songs

**3. `supabase/functions/admin-orders/index.ts`** — After convert_lead_to_order, auto-trigger delivery email if the order has a song:

- After successful order creation, if `lead.full_song_url` exists (order status = "delivered"), automatically call the `send-song-delivery` function
- Log the delivery attempt to activity log
- This way customers get their full song email immediately upon conversion without manual admin intervention

### Summary
- Lyrics prompt gets stricter word count requirements
- Suno callback flags songs under 2:30 for review instead of auto-delivering
- Convert to Order auto-sends delivery email when a song exists

