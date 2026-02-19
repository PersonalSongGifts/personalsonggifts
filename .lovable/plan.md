
## Email Deliverability: Full Audit and Fix Plan

### What's Actually Causing Spam Issues

After reading every email template in the codebase against current spam filter research, here's the honest breakdown of what's working against you — and the real answer to "should we go plain text?"

---

### Current State of Your Emails

You have **4 distinct email types** across 5+ edge functions:

1. **Order Confirmation** (`send-order-confirmation`) — sent to paying customers
2. **Song Delivery** (`send-song-delivery`) — sent when the song is done
3. **Lead Preview** (`send-lead-preview`) — sent to leads who haven't paid yet
4. **Lead Follow-up** (`send-lead-followup`) — sent to leads who haven't converted
5. **Valentine Remarketing** (`send-valentine-remarketing`) — bulk campaign

What's important: emails 1 and 2 are **transactional** (someone paid, they're expecting them). Emails 3–5 are **marketing** (the person never paid, they may not be expecting them). These two categories should be treated very differently because spam filters treat them differently.

---

### What's Triggering Spam Filters Right Now

**Problem 1: Promotional language in subject lines**
- Lead preview subject: `"Your song for [name] is ready"` — acceptable
- Follow-up subject: `"Don't forget [name]'s song - extra $5 off inside"` — the phrase "extra $5 off inside" is a textbook spam trigger. The word "inside" combined with a discount offer is one of the most reliably flagged combinations in email deliverability research.

**Problem 2: "50% Off Today Only!" inside the lead preview email body**
The lead preview HTML contains this exact block:
```
"50% Off Today Only! Complete your order now and get the full song at half price."
```
This is the single biggest deliverability problem in the entire system. "50% Off Today Only!" is on virtually every spam trigger word list. It appears in the HTML *and* the plain text version, so both get flagged. Gmail's spam classifiers are specifically trained on time-pressure discount language.

**Problem 3: The HTML structure signals "bulk promotional email"**
Every email uses a dark colored gradient header (`linear-gradient(135deg, #1E3A5F...)`), colored backgrounds, `box-shadow`, and heavy `<div>` nesting. This exact pattern — colored banner at top, card with shadow, nested colored info boxes — is the template pattern used by bulk marketing tools like Mailchimp, Klaviyo, and Constant Contact. Gmail's machine learning has been trained on billions of these and routes them to Promotions or Spam. Even for transactional emails, this structure works against you.

**Problem 4: `X-Priority: 1` header on all emails**
Every email (including marketing ones) sends `"X-Priority": "1"`, which marks the email as "highest priority." This header is heavily abused by spammers and is considered a spam signal by many filters when present on bulk or promotional mail. For transactional emails it's borderline acceptable; for marketing emails it's a red flag.

**Problem 5: The same sending domain for all email types**
`support@personalsonggifts.com` sends everything — transactional confirmations AND marketing recovery emails. If a recipient marks a follow-up email as spam, it damages the sender reputation for the entire domain, including your order confirmations. Ideally, marketing emails would come from a subdomain like `hello@mail.personalsonggifts.com` — but that's a larger infrastructure change.

---

### Should You Go Full Plain Text?

**The short answer: yes for marketing emails, no for transactional ones. But "plain text" doesn't mean what most people think.**

Here's the nuance:

- The **Valentine remarketing** campaign already uses near-plain-text HTML (minimal styling, white background, no header image, simple links). That's the right approach for unsolicited marketing.
- Order confirmations and song delivery emails are **expected by the customer** — they just paid. A completely unstyled plain text email for these would feel low-quality and erode trust. The goal here isn't to go fully plain, it's to remove the specific spam triggers while keeping a clean, readable design.
- The **lead preview and follow-up** are the sweet spot for going plain — these people haven't paid, they may not remember filling out a form, and the styled "marketing email" look immediately signals "promotional." Plain-text style here would dramatically improve deliverability.

---

### The Fix Plan

#### Email 1 & 2: Order Confirmation + Song Delivery (Keep styled, remove triggers)
These are true transactional emails to paying customers. Keep some styling but simplify:
- Remove `box-shadow` from the card wrapper
- Remove the dark gradient header — replace with simple text header in the brand color
- Remove all colored info boxes — use simple text tables or plain paragraphs instead
- Keep `Precedence: transactional` header
- **Remove `X-Priority: 1`** — this is a spam signal and adds no deliverability benefit for Brevo-sent email

#### Email 3: Lead Preview (Strip down aggressively)
This is the most important fix. Apply the same plain approach as the Valentine remarketing email:
- **Remove `"50% Off Today Only!"`** — this is the single highest-risk phrase in the system. Replace with something softer like `"Special offer available for a limited time"` or nothing at all.
- Remove the dark gradient header
- Remove colored boxes and shadows
- Use the Valentine-remarketing style: white background, system font, simple link, minimal structure

**New subject line direction:** Keep `"Your song for [name] is ready"` — this is clean and passes filters.

#### Email 4: Lead Follow-up (Strip down aggressively)
- **Change subject** from `"Don't forget [name]'s song - extra $5 off inside"` → Something like `"Your song is still waiting for you"` — remove the discount mention from the subject entirely. Mention FULLSONG code in the body instead.
- Apply the same plain style as the valentine remarketing email
- Remove the FULLSONG promo box styling — just mention it in plain text: `"Use code FULLSONG at checkout to save $5."`

#### All Emails: Remove `X-Priority: 1`
This header appears in every single edge function. It should be removed from all of them.

---

### Files to Change

| File | Change |
|---|---|
| `supabase/functions/send-order-confirmation/index.ts` | Remove dark gradient header, remove colored boxes, remove `X-Priority: 1`, simplify HTML to minimal structure |
| `supabase/functions/send-song-delivery/index.ts` | Same structural simplification, remove `X-Priority: 1` |
| `supabase/functions/send-lead-preview/index.ts` | Remove `"50% Off Today Only!"`, strip to valentine-remarketing style HTML, remove `X-Priority: 1` |
| `supabase/functions/send-lead-followup/index.ts` | Change subject line, strip to plain style, remove promo box styling, remove `X-Priority: 1` |
| `supabase/functions/send-test-email/index.ts` | Update the template preview functions to match new templates |
| `src/components/admin/EmailTemplates.tsx` | Update the HTML preview strings to match the new cleaner templates |

---

### What This Looks Like in Practice

**Order Confirmation (stays styled, but cleaner):**
- White background throughout
- Bold text heading instead of dark gradient banner
- Simple table for order details — no colored boxes
- Plain paragraph sign-off
- Still branded, still readable, no spam signals

**Lead Preview + Follow-up (plain personal style like valentine campaign):**
- White background, system font (Arial/Helvetica), no header graphic
- Opens with: `"Hi [name],"` on its own line
- 2-3 short paragraphs
- A bare hyperlink (not a big styled button) plus the URL written out
- Promo code mentioned in plain text
- Closes with `"— The Personal Song Gifts Team"`
- Looks like a personal email from a real person

---

### What This Will and Won't Fix

**Will help significantly:**
- Removing "50% Off Today Only!" is the single highest-impact change
- Removing the discount mention from the follow-up subject line
- Removing `X-Priority: 1` from all emails
- Simplifying HTML structure so Gmail doesn't auto-route to Promotions

**Won't fully fix (but nothing in code can):**
- If recipients have previously marked emails from your domain as spam, that history affects future delivery — only good sending behavior over time rebuilds reputation
- Verizon.net (AOL/Yahoo infrastructure) and Comcast are notoriously aggressive spam filters that sometimes block even authenticated, clean emails — no code change fixes their filtering policies
- Gmail's Promotions tab is not the same as spam — most order confirmations land there for Gmail users. The tab is not spam; the email is still delivered and visible

**Recommend checking in Brevo dashboard:**
- Your domain spam complaint rate (should be under 0.1%)
- Your bounce rate (high bounces tank sender reputation)
- Whether SPF/DKIM/DMARC are all confirmed active on Brevo

