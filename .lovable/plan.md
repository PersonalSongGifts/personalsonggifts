

## Add Spam Folder Warning to Order Confirmation Page

Add a prominent notice on the order confirmation page reminding customers to check their junk/spam folder and add `support@personalsonggifts.com` to their contacts, to reduce chargebacks from customers who miss their song delivery emails.

### Changes

**File: `src/pages/Confirmation.tsx`**

Add a new highlighted callout card between the "What Happens Next" steps card and the support note. It will include:

- A mail/inbox icon for visual emphasis
- Bold heading: "Don't miss your song!"
- Instructions to:
  1. Check your spam/junk folder for emails from `support@personalsonggifts.com`
  2. Add `support@personalsonggifts.com` to your contacts to ensure delivery
- Styled with a warm background color (e.g., `bg-amber-50` with `border-amber-200`) to make it stand out without feeling alarming

This sits naturally after the "Check your inbox" step and before the support contact info, reinforcing the message at the right moment.

### Technical Details

- No backend changes needed
- Single file edit to `src/pages/Confirmation.tsx`
- Add a new `<Card>` or styled `<div>` block around line 95 (after the "What Happens Next" card closing tag, before the support paragraph)
- Uses existing Lucide icons (`Mail` or `AlertCircle`) already imported or available

