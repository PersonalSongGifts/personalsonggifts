
# Email Deliverability Improvement Plan

## Summary

Your emails are going to spam due to a combination of template structure issues and potentially missing DNS authentication. This plan addresses both the immediate template improvements and the DNS verification needed.

---

## Current Setup Confirmed

| Setting | Value |
|---------|-------|
| Email Provider | **Brevo** (formerly Sendinblue) |
| From Address | `support@personalsonggifts.com` |
| From Domain | `personalsonggifts.com` |
| Templates | 6 edge functions sending emails |

**Good news:** Your templates already include HTML + plain text versions, List-Unsubscribe headers, and physical address. We just need refinements.

---

## Phase 1: DNS Authentication (Critical - You Must Verify)

### Action Required Outside Lovable

You need to verify in **Brevo Dashboard** that your sending domain `personalsonggifts.com` has:

1. **SPF Record** - Authorizes Brevo to send on behalf of your domain
2. **DKIM Record** - Cryptographically signs emails
3. **DMARC Record** - Tells receivers how to handle failed authentication

**How to check:**
1. Log into [Brevo Dashboard](https://app.brevo.com)
2. Go to **Settings -> Senders, Domains & Dedicated IPs -> Domains**
3. Find `personalsonggifts.com` and check if it shows "Verified" for SPF and DKIM
4. If not verified, follow Brevo's instructions to add DNS records to GoDaddy

**Expected DNS records for GoDaddy:**

```text
# SPF (TXT record)
Host: @
Value: v=spf1 include:sendinblue.com ~all

# DKIM (TXT record) 
Host: mail._domainkey
Value: [Get this from Brevo dashboard - unique per account]

# DMARC (TXT record)
Host: _dmarc  
Value: v=DMARC1; p=quarantine; rua=mailto:support@personalsonggifts.com
```

---

## Phase 2: Template Improvements (Code Changes)

### 2.1 Lead Preview Email - Make Functional Without Images

**File:** `supabase/functions/send-lead-preview/index.ts`

**Changes:**
- Add plain text URL below the button for when button doesn't render
- Remove emoji from subject line
- Add explicit "If images don't load" fallback text
- Add `Precedence: transactional` header

**Before (button only):**
```html
<a href="${previewUrl}" style="...">
  🎵 Listen to Your Preview
</a>
```

**After (button + fallback):**
```html
<a href="${previewUrl}" style="...">
  Listen to Your Preview
</a>
<p style="text-align: center; margin-top: 15px;">
  If the button doesn't work, copy this link:<br>
  <a href="${previewUrl}" style="color: #1E3A5F; word-break: break-all;">
    ${previewUrl}
  </a>
</p>
```

**Subject line change:**
- From: `💝 Your song for ${lead.recipient_name} is ready!`
- To: `Your song for ${lead.recipient_name} is ready`

### 2.2 Lead Follow-up Email

**File:** `supabase/functions/send-lead-followup/index.ts`

**Changes:**
- Add plain text URL fallback
- Remove emoji from subject line
- Add `Precedence: transactional` header

**Subject line change:**
- From: `💝 Don't forget ${lead.recipient_name}'s song!`
- To: `Don't forget ${lead.recipient_name}'s song - extra $5 off inside`

### 2.3 Order Confirmation Email

**File:** `supabase/functions/send-order-confirmation/index.ts`

**Changes:**
- Remove emoji from subject line
- Ensure `Precedence: transactional` header present

**Subject line change:**
- From: `🎵 Order confirmed - ${recipientName}'s song is being created!`
- To: `Order confirmed - ${recipientName}'s song is being created`

### 2.4 Song Delivery Email

**File:** `supabase/functions/send-song-delivery/index.ts`

**Changes:**
- Add plain text URL fallback below button
- Remove emoji from subject line and H1

**Subject line change:**
- From: `🎵 ${recipientName}'s song is complete!`
- To: `${recipientName}'s song is complete and ready to share`

### 2.5 Scheduled Deliveries (Lead Previews)

**File:** `supabase/functions/process-scheduled-deliveries/index.ts`

**Changes:**
- Add plain text URL fallback
- Remove emojis from subject lines
- Add `Precedence: transactional` header

---

## Phase 3: Test Email Templates Update

**File:** `supabase/functions/send-test-email/index.ts`

Update all test templates to mirror the production changes (URL fallbacks, no emojis).

---

## Technical Details

### Headers to Add/Ensure on All Emails

```typescript
headers: {
  "Message-ID": messageId,
  "X-Entity-Ref-ID": orderId,
  "X-Priority": "1",
  "Precedence": "transactional",
  "List-Unsubscribe": `<mailto:...>, <https://...>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
}
```

### Plain Text Fallback Pattern

For every email with a CTA button, add this below:

```html
<p style="text-align: center; margin-top: 15px; font-size: 13px; color: #666;">
  <strong>Can't see the button?</strong> Copy this link:<br>
  <a href="${url}" style="color: #1E3A5F; word-break: break-all; font-size: 12px;">
    ${url}
  </a>
</p>
```

### Subject Line Best Practices

| Before | After |
|--------|-------|
| 💝 Your song for X is ready! | Your song for X is ready |
| 🎵 Order confirmed | Order confirmed |
| 💝 Don't forget... | Don't forget... |

Removing emojis from subject lines reduces spam scoring significantly.

---

## Files to Modify

1. `supabase/functions/send-lead-preview/index.ts`
2. `supabase/functions/send-lead-followup/index.ts`
3. `supabase/functions/send-order-confirmation/index.ts`
4. `supabase/functions/send-song-delivery/index.ts`
5. `supabase/functions/process-scheduled-deliveries/index.ts`
6. `supabase/functions/send-test-email/index.ts`

---

## Verification Steps

After implementation:

1. **Send test emails** using Admin dashboard to your own email
2. **Check spam folder** - emails should now land in inbox
3. **View with images disabled** - should still be usable with plain text URL
4. **Use mail-tester.com** - Send a test email to their address to get a spam score
5. **Check Brevo analytics** - Monitor delivery rates and bounce rates

---

## Expected Outcome

- Emails more likely to reach inbox due to cleaner subject lines and proper headers
- If emails do land in spam, users can still click through via plain text URLs
- Better sender reputation over time with proper DNS authentication
