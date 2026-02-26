

# CS Assistant Tab — Phase 1: Lookup + Smart Draft Reply

## Overview

A new "CS Assistant" tab in the admin panel with customer email lookup and AI-powered draft response generation. Includes email triage logic, structured reasoning output, quick-copy song URL buttons, and repeat customer detection.

No Gmail integration, no Slack, no auto-sending. All drafts are for human review and copy-paste.

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/admin-orders/index.ts` | Add `cs_lookup` action (~25 lines) |
| `supabase/functions/cs-draft-reply/index.ts` | New edge function for AI draft generation |
| `supabase/config.toml` | Add cs-draft-reply function config |
| `src/components/admin/CSAssistant.tsx` | New component -- full CS assistant UI |
| `src/pages/Admin.tsx` | Add CS Assistant tab (line ~1083: grid-cols-6 to grid-cols-7, new TabsTrigger + TabsContent) |

---

## 1. Backend: `cs_lookup` action in admin-orders

Add a new action handler inside the existing edge function (same auth pattern):

- Accepts `{ action: "cs_lookup", email: "...", adminPassword: "..." }`
- Queries `orders` where `customer_email ILIKE '%email%'`, sorted by `created_at DESC`, limit 50
- Queries `leads` where `email ILIKE '%email%'`, same treatment
- Returns `{ orders: [...], leads: [...] }`

No new tables, no new RPC functions.

## 2. Backend: New `cs-draft-reply` edge function

Streaming edge function using Lovable AI (`google/gemini-3-flash-preview`):

- Accepts: `{ adminPassword, customerMessage, orders: [...], leads: [...] }`
- Validates admin password (same pattern as admin-orders)
- Builds a system prompt with all order/lead context + brand voice + triage rules
- Calls `https://ai.gateway.lovable.dev/v1/chat/completions` with `stream: true`
- Streams SSE response back to the client
- Handles 429/402 rate limit errors

### System Prompt -- Triage Logic

The system prompt will instruct the AI to:

**First, classify the email and check for special cases:**

- "Unsubscribe" or similar --> output: "No response needed -- this is an unsubscribe request. Archive it."
- Stripe automated notification (payout, payment received) --> output: "No response needed -- this is an automated Stripe notification."
- Dispute/chargeback/Stripe dispute --> output: "ESCALATE: This is a payment dispute. Do not respond -- flag for owner review."
- Legal threats, BBB, attorney --> output: "ESCALATE: This requires owner review before any response."
- Abusive/profanity --> prefix draft with: "NOTE: Customer tone is hostile. Suggested response is measured. Review before sending."
- Unreasonable/scam pattern (claimed non-receipt of confirmed-delivered song, refund after download, vague repeated complaints) --> prefix draft with: "FLAG: This request may be unreasonable. Here's why: [reason]. Recommended approach: [approach]."

**Then, for all normal cases, output in this structured format:**

```
Assessment: [What kind of email this is]
Flags: [Any concerns, or "None"]
Plan: [What the response will do]

---

Draft Response:
[The actual email draft]
```

**Brand voice rules:**
- Warm, personal, empathetic, small-business feel
- Never mention AI, automation, Suno, Gemini, Kie.ai
- Always frame as "our team" or "our songwriters"
- Sign off warmly as "The PersonalSongGifts Team"

**Scenario-specific handling:**
- "Where is my song?" -- check sent_at, provide song_url, suggest spam/promotions folder
- "Change request" -- check automation_status to determine if update or regeneration needed
- "Not happy" -- offer revision, ask what to change, never jump to refund
- "Refund request" -- acknowledge frustration, offer revision first
- "Thank you" -- short warm acknowledgment
- "Status inquiry" -- clear timeline from order data
- "Pre-purchase question" -- answer from FAQ knowledge (pricing: $49 standard / $79 rush, delivery timing, process)

## 3. Frontend: `CSAssistant.tsx` Component

### Layout (top to bottom):

**A. Email Search Bar**
- Input field + "Lookup" button
- Triggers `cs_lookup` action

**B. Customer Context Panel** (appears after lookup)

- **Repeat customer badge**: If orders.length > 1, show "Repeat customer (X orders)" badge prominently at the top in a distinct color
- **Summary header**: Customer name, email, total orders + leads count

- **Order cards** (most recent first), each showing:
  - Order ID (short 8 chars), created date
  - Status badge + automation status badge (color-coded)
  - Occasion, recipient name, genre, pricing tier ($49/$79)
  - Song URL as clickable link with a **small copy icon button** next to it for one-click copy
  - Delivery info: sent_at, target_send_at, delivery_status
  - **Attention flags**: Red badge if status is `failed`, `needs_review`, or delivery is overdue (target_send_at is past and sent_at is null)

- **Lead cards** (smaller, below orders):
  - Lead ID (short), captured date, status, occasion, recipient, genre
  - Preview URL if exists

**C. Draft Reply Section** (appears after lookup)

- Textarea: "Paste the customer's email message here"
- "Draft Reply" button
- Streaming response area showing the AI's structured output (Assessment / Flags / Plan / Draft) as it generates
- "Copy Draft to Clipboard" button (copies only the draft response portion)
- "Regenerate" button to re-run with same inputs

## 4. Admin.tsx Integration

- Import `CSAssistant` component
- Line ~1083: Change `grid-cols-6` to `grid-cols-7`
- Add new `TabsTrigger` with `MessageSquare` icon and "CS Assistant" label
- Add `TabsContent` rendering `<CSAssistant adminPassword={password} />`
- Pass the admin password prop so the component can authenticate API calls

---

## What This Does NOT Change

- No existing admin tabs, automation, or customer-facing pages modified
- No database schema changes
- No new tables
- No Gmail or Slack integration (deferred)
- No auto-sending -- everything is copy-paste for human review
