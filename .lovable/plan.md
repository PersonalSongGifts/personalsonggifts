

# Fix Email Deliverability (Stop Emails Going to Spam)

## Root Causes Identified

| Issue | Impact | Fix |
|-------|--------|-----|
| Missing physical address | CAN-SPAM violation, spam trigger | Add address to footer |
| Spammy subject lines (emojis, urgency) | Major spam trigger | Rewrite cleaner subjects |
| No List-Unsubscribe header | Gmail/Yahoo/Microsoft requirement | Add HTTP header via Brevo API |
| Promotional content in transactional emails | Mixed signals to spam filters | Separate or tone down |
| No plain text version | Looks like spam to filters | Add `textContent` to API calls |
| No unsubscribe link | Required for promotional emails | Add footer link |

---

## Part 1: Add List-Unsubscribe Header

Add the `headers` parameter to all Brevo API calls. This is the most impactful fix.

**All email edge functions** (lead-preview, lead-followup, order-confirmation, song-delivery, send-test-email):

```typescript
body: JSON.stringify({
  sender: { name: senderName, email: senderEmail },
  replyTo: { email: senderEmail, name: senderName },
  to: [{ email: customerEmail, name: customerName }],
  subject: subject,
  htmlContent: emailHtml,
  textContent: plainTextVersion,  // NEW
  headers: {
    "List-Unsubscribe": `<mailto:unsubscribe@personalsonggifts.com?subject=Unsubscribe>, <https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(customerEmail)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
  }
}),
```

---

## Part 2: Add Plain Text Versions

Generate a plain text alternative for each email template. Example for order confirmation:

```typescript
const textContent = `
Order Confirmed!

Dear ${customerName},

Thank you for your order! We're creating a personalized song for ${recipientName}.

Order Details:
- Order ID: ${orderId.slice(0, 8).toUpperCase()}
- For: ${recipientName}
- Occasion: ${occasion}
- Genre: ${genre}
- Expected Delivery: ${deliveryDate}

We'll email you when your song is ready.

With love,
The Personal Song Gifts Team

Personal Song Gifts
123 Music Lane, Nashville, TN 37203
https://personalsonggifts.lovable.app
`;
```

---

## Part 3: Clean Up Subject Lines

Replace emoji-heavy, urgent subject lines with cleaner versions:

| Template | Current Subject | New Subject |
|----------|-----------------|-------------|
| Lead Preview | `🎵 Your song for ${name} is ready - listen now!` | `Your song for ${name} is ready to preview` |
| Lead Follow-up | `🎁 Extra $5 off your song for ${name} - limited time!` | `A special offer for ${name}'s song` |
| Order Confirmation | `🎵 Your song for ${name} is being created!` | `Order confirmed - ${name}'s song is being created` |
| Song Delivery | `🎉 Your song for ${name} is ready!` | `${name}'s song is complete and ready to share` |

---

## Part 4: Add Physical Address to All Email Footers

Update the footer section in all email templates:

```html
<div style="text-align: center; padding: 20px;">
  <p style="color: #6B7B8C; font-size: 12px; margin: 0;">
    © 2026 Personal Song Gifts<br>
    123 Music Lane, Nashville, TN 37203<br>
    <a href="https://personalsonggifts.lovable.app" style="color: #1E3A5F;">personalsonggifts.com</a>
  </p>
  <p style="color: #999; font-size: 11px; margin-top: 10px;">
    <a href="https://personalsonggifts.lovable.app/unsubscribe?email={{email}}" style="color: #999;">Unsubscribe</a>
  </p>
</div>
```

---

## Part 5: (Optional) Create Unsubscribe Page

Create a simple `/unsubscribe` route that:
1. Reads the email from query params
2. Displays a confirmation message
3. (Future) Stores preference in database

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/send-lead-preview/index.ts` | Add headers, textContent, clean subject, fix footer |
| `supabase/functions/send-lead-followup/index.ts` | Add headers, textContent, clean subject, fix footer |
| `supabase/functions/send-order-confirmation/index.ts` | Add headers, textContent, clean subject, fix footer |
| `supabase/functions/send-song-delivery/index.ts` | Add headers, textContent, clean subject, fix footer |
| `supabase/functions/send-test-email/index.ts` | Add headers, textContent, clean subjects, fix footers |
| `src/pages/Unsubscribe.tsx` | NEW - Simple unsubscribe confirmation page |
| `src/App.tsx` | Add route for `/unsubscribe` |

---

## DNS/Brevo Verification (Manual Steps)

You should also verify these settings in Brevo and GoDaddy (outside of Lovable):

1. **Brevo Dashboard** → Senders, Domains, IPs → Verify green checkmarks for:
   - DKIM signature ✅
   - DMARC policy ✅

2. **GoDaddy DNS** → Confirm these records exist:
   - SPF record: `v=spf1 include:spf.brevo.com ~all`
   - DKIM record: (provided by Brevo)
   - DMARC record: `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com`

3. **Gmail Postmaster Tools** → Monitor spam complaint rate (must stay under 0.3%)

---

## Important Note About Your Address

You'll need to provide a real physical mailing address to include in the email footer. This is legally required for commercial emails. If you don't have a business address, you can use:
- A PO Box
- A virtual mailbox service (like iPostal1 or Anytime Mailbox)
- A registered agent address

---

## Expected Impact

After these changes:
- **List-Unsubscribe header**: Major improvement for Gmail/Yahoo/Microsoft
- **Plain text version**: Signals legitimate email to spam filters
- **Cleaner subjects**: Reduces spam score significantly
- **Physical address**: Legal compliance + trust signal
- **Unsubscribe link**: Required for promotional content

