

# Fix: Add "Send Test Email" Button to Admin Dashboard

## Problem
You uploaded a song but nothing happened because:
1. The current system requires a **2-step process**: Upload → then manually click "Send Preview"
2. You may have been testing with a converted lead, which hides the upload option
3. There's no way to quickly test what the email looks like without a real unconverted lead

## Solution
Add a **"Send Test Email"** button in the Admin → Emails section that sends the lead preview email template directly to any email address you specify - no lead record needed.

---

## Changes

### 1. Update Email Templates Section (Admin → Emails tab)
Add a "Test Lead Preview Email" card with:
- Email input field (pre-filled with your email)
- "Send Test" button
- Uses placeholder data (sample recipient name, occasion, preview link)

### 2. New Edge Function: `send-test-email`
Creates a test version of the lead preview email and sends it to the specified address.

---

## Email Testing Flow After Implementation

```text
Admin Dashboard → Emails Tab
┌─────────────────────────────────────────────────────────┐
│  Test Lead Preview Email                                │
│                                                         │
│  Send a test version of the lead preview email to       │
│  see exactly what customers receive.                    │
│                                                         │
│  Email: [ryan@hyperdrivelab.com    ]                   │
│                                                         │
│  [ Send Test Email ]                                    │
└─────────────────────────────────────────────────────────┘
```

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `supabase/functions/send-test-email/index.ts` | New function to send test emails |
| `src/components/admin/EmailTemplates.tsx` | Add "Send Test Email" UI |
| `supabase/config.toml` | Register new edge function |

---

## Technical Details

### send-test-email Edge Function

```typescript
// Sends the lead preview email template with sample data
// to a specified email address for testing

Request body:
{
  "email": "ryan@hyperdrivelab.com",
  "template": "lead_preview",  // or "lead_followup", "order_confirmation", "song_delivery"
  "adminPassword": "..."
}

Response:
{
  "success": true,
  "messageId": "..."
}
```

### Sample Data Used in Test Email
- Customer Name: "Test Customer"
- Recipient Name: "Test Recipient"  
- Occasion: "Birthday"
- Preview URL: Links to `/preview/demo` (a demo preview page)

---

## Bonus: Demo Preview Page
Add a `/preview/demo` route that shows the preview page with sample audio, so you can test the full customer experience without a real lead.

