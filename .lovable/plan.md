

# CS Assistant Updates: Real-World Patterns + Name Search

Three targeted changes to make the CS Assistant match real support patterns.

---

## Changes

### 1. Update System Prompt in `cs-draft-reply/index.ts`

Add real-world pattern knowledge to the system prompt:

- **Spam folder priority**: Add a dedicated section explaining that 60-70% of emails are about songs going to spam. When `sent_at` is populated and customer says they didn't receive it, ALWAYS use the specific language: "We've had a few reports that different email carriers are marking the song delivery email as spam. Here is a direct link to your song so you can listen right away: [song_url]". Tone should be reassuring, not apologetic.
- **Name pronunciation**: Add scenario for name/word pronunciation issues. Draft should ask for phonetic spelling with an example like "Mee-SHELL vs MI-chelle". Explain we rewrite lyrics with phonetic spelling so it's sung correctly.
- **Post-purchase detail additions**: When customer replies to add more story details, warmly acknowledge and confirm it's been noted.
- **Wrong email on file**: When lookup returns no results (empty orders/leads arrays), suggest customer may have used a different email at checkout.
- **Silent chargebacks**: Reinforce the existing ESCALATE rule for Stripe disputes.
- **Excited/emotional customers**: Brief warm acknowledgment, no action needed.

### 2. Add Name Search to `cs_lookup` in `admin-orders/index.ts`

Expand the existing `cs_lookup` action (lines 164-193) to also search by `customer_name` and `recipient_name`:

- Query orders where `customer_email ILIKE '%search%'` OR `customer_name ILIKE '%search%'` OR `recipient_name ILIKE '%search%'`
- Query leads where `email ILIKE '%search%'` OR `customer_name ILIKE '%search%'` OR `recipient_name ILIKE '%search%'`
- Since Supabase JS SDK doesn't support OR across different columns with ILIKE easily, use `.or()` filter: `.or(`customer_email.ilike.%${search}%,customer_name.ilike.%${search}%,recipient_name.ilike.%${search}%`)`
- Rename the body parameter from `email` to `search` internally (keep backward compat by accepting either)

### 3. Make Song URL Copy Button More Prominent in `CSAssistant.tsx`

- Change the small ghost icon button to a more visible button with "Copy Link" text and a distinct color
- Update the search input placeholder to indicate it accepts names too: "Email address or name..."
- Update the `handleLookup` to pass `search` (keeping backward compat with the renamed parameter)
- When no results are found, show a helpful message suggesting the customer may have used a different email

---

## Files Changed

| File | What Changes |
|------|-------------|
| `supabase/functions/cs-draft-reply/index.ts` | System prompt updated with real-world patterns (spam folder language, name pronunciation, post-purchase details, wrong email, excited customers) |
| `supabase/functions/admin-orders/index.ts` | `cs_lookup` action expanded to search by customer_name and recipient_name in addition to email |
| `src/components/admin/CSAssistant.tsx` | Search placeholder updated, song URL copy button made prominent, "no results" message suggests trying different email |

