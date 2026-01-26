

# Email System + Admin Dashboard Plan

## Overview
This plan implements two connected features:
1. **Order Confirmation Email** - Automatic email sent immediately after payment
2. **Admin Dashboard** - Protected page where you manage orders and send song delivery emails

## How It Will Work

### Order Confirmation Flow (Automatic)
```text
Customer pays → Payment success → Order created → Confirmation email sent automatically
```

The email will include:
- Order ID
- What they ordered (recipient, occasion, genre)
- Expected delivery time (3h for Priority, 24h for Standard)
- Your contact email for questions

### Song Delivery Flow (Manual via Admin Dashboard)
```text
You finish song → Go to /admin → Find the order → Paste Google Drive link → Click "Send Song" → Customer receives email with link
```

The admin dashboard will show:
- All orders in a table view
- Status indicators (Pending, Delivered)
- Form to paste the Google Drive link
- "Send Song" button that emails the customer

---

## What You'll See

### Admin Dashboard (/admin)
A clean table showing all orders with:

| Order ID | Customer | Recipient | Occasion | Status | Expected | Actions |
|----------|----------|-----------|----------|--------|----------|---------|
| AB12CD34 | john@... | Mom | Mother's Day | Pending | Jan 27, 3pm | [Deliver Song] |
| EF56GH78 | jane@... | Dad | Birthday | ✓ Delivered | Jan 26, 1pm | [View] |

When you click "Deliver Song":
1. A form appears to paste the Google Drive link
2. You click "Send"
3. The customer gets an email with the song link
4. The order status updates to "Delivered"

---

## Implementation Steps

### 1. Set Up Email Service (Resend)
You'll need to:
- Create an account at resend.com (free tier: 100 emails/day)
- Verify your domain (personalsonggifts.com)
- Get an API key
- I'll add the API key as a secret

### 2. Create Order Confirmation Email Function
**File:** `supabase/functions/send-order-confirmation/index.ts`

Sends email immediately after order is created with:
- Order details
- Expected delivery time
- "Your song is being crafted" message

### 3. Update Payment Processing
**File:** `supabase/functions/process-payment/index.ts`

After creating the order, call the email function to send confirmation.

### 4. Create Song Delivery Email Function
**File:** `supabase/functions/send-song-delivery/index.ts`

Sends the "Your song is ready!" email with:
- The Google Drive link you provide
- Recipient name
- A heartfelt message

### 5. Create Admin Dashboard Page
**File:** `src/pages/Admin.tsx`

Features:
- List of all orders (most recent first)
- Status filter (All / Pending / Delivered)
- "Deliver Song" button that opens a form
- Form to paste Google Drive link and send

### 6. Create Admin Edge Function
**File:** `supabase/functions/admin-orders/index.ts`

Handles:
- Fetching all orders (for the dashboard)
- Updating order status and song URL
- Triggering delivery email

### 7. Add Admin Route
**File:** `src/App.tsx`

Add `/admin` route pointing to the new Admin page.

---

## Security Notes

The admin dashboard will be accessible at `/admin`. Since you don't have user authentication set up yet, I'll implement a simple password protection:
- When you visit `/admin`, you'll be asked for a password
- The password will be stored as a secret (not in code)
- This keeps it simple while preventing public access

If you want proper admin accounts later, we can add full authentication.

---

## Email Templates

### Order Confirmation Email
```
Subject: Your Personal Song is Being Crafted! 🎵

Hi [Customer Name],

Thank you for your order! We're thrilled to create a special song for [Recipient Name].

ORDER DETAILS
-------------
Order ID: [ID]
Song for: [Recipient Name]
Occasion: [Occasion]
Style: [Genre]
Package: [Standard/Priority]

Expected Delivery: Within [3/24] hours
(By [Date/Time])

Our songwriters are already working on something beautiful. 
You'll receive another email when your song is ready!

Questions? Reply to this email or contact hello@personalsonggifts.com

With love,
The Personal Song Gifts Team
```

### Song Delivery Email
```
Subject: 🎵 Your Song for [Recipient] is Ready!

Hi [Customer Name],

Great news! Your personalized song for [Recipient Name] is complete and ready to share!

🎧 LISTEN TO YOUR SONG:
[Google Drive Link Button]

We hope this song brings joy to [Recipient Name] and creates a beautiful memory.

Tips for sharing:
• Play it during a special moment
• Send the link with a heartfelt message
• Download it to keep forever

Thank you for trusting us with your special story.

With love,
The Personal Song Gifts Team
```

---

## What You'll Need to Provide

1. **Resend API Key** - I'll prompt you to add this
2. **Verified domain** - personalsonggifts.com needs to be verified in Resend
3. **Admin password** - A simple password for accessing /admin

---

## Summary

| Feature | What It Does |
|---------|--------------|
| Order Confirmation Email | Automatic email after payment with order details |
| Admin Dashboard | View all orders, manage delivery |
| Song Delivery Email | You paste Google Drive link, customer gets email |
| Password Protection | Simple security for /admin page |

