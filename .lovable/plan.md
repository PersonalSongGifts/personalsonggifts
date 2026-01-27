

# Pricing & Delivery Time Update Plan

## Overview
Update the delivery times across the entire system from the current structure to the new one, while keeping prices unchanged.

## Pricing Changes

| Tier | Current | New |
|------|---------|-----|
| **Standard** | $49 / 24-hour delivery | $49 / **48-hour** delivery |
| **Priority** | $79 / 3-hour rush | $79 / **24-hour** rush |

**Note:** The prices ($49 and $79) stay the same - only the delivery windows are changing.

---

## What Will Be Updated

### 1. Checkout Page
Update the delivery time labels customers see when selecting their package.

### 2. Payment Success Page  
Update the delivery time shown after purchase confirmation.

### 3. Order Processing Backend
Update the calculation that determines when an order should be delivered.

### 4. Confirmation Emails
Update the email templates to show the correct delivery tier labels.

### 5. FAQ Section
Update the FAQ answer about delivery times to reflect the 48-hour standard.

### 6. Stripe Product Descriptions
Update the product descriptions in Stripe to show accurate delivery windows.

---

## Technical Details

### Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Checkout.tsx` | Change "24 hours" → "48 hours" for Standard, "3-hour" → "24-hour" for Priority |
| `src/pages/PaymentSuccess.tsx` | Change "3 hours" → "24 hours" for Priority, "24 hours" → "48 hours" for Standard |
| `supabase/functions/process-payment/index.ts` | Update delivery calculation: Priority = 24h, Standard = 48h |
| `supabase/functions/create-order/index.ts` | Update delivery calculation to match |
| `supabase/functions/send-order-confirmation/index.ts` | Change tier labels in email template |
| `src/components/home/FAQSection.tsx` | Update FAQ answer to say "48 hours" |

### Stripe Product Updates
The existing Stripe products need their descriptions updated:
- **Standard Song**: "Custom personalized song with 24-hour delivery" → "48-hour delivery"
- **Priority Song**: "Custom personalized song with 3-hour rush delivery" → "24-hour rush delivery"

*Note: The prices themselves ($49 and $79) remain unchanged in Stripe.*

---

## Summary of Text Changes

| Location | Current Text | New Text |
|----------|-------------|----------|
| Checkout (Standard) | "Typically within 24 hours" | "Typically within 48 hours" |
| Checkout (Priority) | "3-hour rush production & delivery" | "24-hour rush delivery" |
| Checkout (Priority bullet) | "3-hour rush delivery" | "24-hour rush delivery" |
| PaymentSuccess | "3 hours" / "24 hours" | "24 hours" / "48 hours" |
| Email Template | "Priority (3-hour)" / "Standard (24-hour)" | "Priority (24-hour)" / "Standard (48-hour)" |
| FAQ | "within 24 hours" | "within 48 hours" |
| Backend calculation | 3h / 24h | 24h / 48h |

