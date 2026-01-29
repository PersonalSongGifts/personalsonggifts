
# Email Template Preview Page

## Overview
Add a new "Emails" tab to the Admin Dashboard that displays visual previews of both email templates using sample data. This will let you see exactly what customers receive without needing to edit HTML code.

## What You Will See

### New Tab in Admin Dashboard
A fourth tab called "Emails" will appear alongside Analytics, Orders, and Leads.

### Two Email Previews
1. **Order Confirmation Email** - What customers see after payment
   - Navy gradient header with "Order Confirmed!" message
   - Order details table (Order ID, recipient, occasion, genre, delivery tier)
   - Expected delivery date
   - Cream/warm background styling

2. **Song Delivery Email** - What customers see when their song is ready
   - Green gradient header with "Your Song is Ready!" message
   - "Listen to Your Song" button
   - Tips for sharing section
   - Order ID reference

### Sample Data Display
Each preview will be populated with realistic sample data:
- Customer: "Sarah Johnson"
- Recipient: "Mom"
- Occasion: "Mother's Day"
- Genre: "Acoustic Pop"
- Order ID: "ABC12345"
- Song URL: (sample link for delivery email)

### Layout
- Side-by-side previews on desktop (two cards)
- Stacked on mobile
- Each email renders in an iframe to show exact email appearance
- Labels above each preview identifying the email type

---

## Technical Details

### New Component
Create `src/components/admin/EmailTemplates.tsx` containing:
- The exact HTML templates from the Edge Functions
- Sample data injection
- Responsive card layout with iframe previews

### Admin Page Updates
Modify `src/pages/Admin.tsx` to:
- Import the new EmailTemplates component
- Add a fourth tab trigger ("Emails" with Mail icon)
- Add TabsContent for the email templates view

### Files to Create/Modify
| File | Action |
|------|--------|
| `src/components/admin/EmailTemplates.tsx` | Create new component |
| `src/pages/Admin.tsx` | Add Emails tab |
