
Goal: make the test flow behave like a real customer flow, so you can actually verify “unlock song with $10 off” without dead links or guessing.

What’s broken right now
- The real test lead already exists and is usable: `TEST-DISCOUNT-2026-RYAN`
- The reason your test email failed is that `supabase/functions/send-test-email/index.ts` still hardcodes `previewToken: "demo"`, so the email sends a fake link that always shows “Invalid preview token”
- The automatic follow-up discount is not controlled by a code on the preview page; it is applied by the `?followup=true` URL
- `create-lead-checkout` does allow promo codes in Stripe Checkout, but that is Stripe’s native promo-code field, so only real Stripe promotion codes work there; the hardcoded `ADMINTEST99` logic is not wired into lead-preview checkout

Implementation plan
1. Fix the test email to use a real lead
- Update `send-test-email` so it no longer uses `demo`
- Make it pull a real lead with a valid `preview_token`, `preview_song_url`, and `full_song_url`
- For the follow-up template, generate `/preview/<real-token>?followup=true`

2. Make the admin test sender show exactly what it will test
- Add a field or selector in `src/components/admin/TestEmailSender.tsx` for a real preview token / real test lead
- Show the exact preview URL in the UI so you can click it directly before emailing it

3. Sync the test-email content with the live follow-up email
- Update the test follow-up template so it matches the real follow-up copy
- That removes the mismatch between what you preview in admin and what customers actually receive

4. Make “test with a code” work the same way customers see it
- Keep `?followup=true` for the built-in $10-off customer journey
- If you also want to test entering a code at checkout, use a real Stripe promotion code for lead-preview checkout
- If you want an internal-only code for this exact flow, extend `create-lead-checkout` to support it explicitly instead of relying on the direct-checkout logic

5. End result: the test flow from your perspective
- Open `/preview/TEST-DISCOUNT-2026-RYAN?followup=true`
- Confirm the page shows the discounted lead price ($39.99)
- Click “Get Full Song”
- At Stripe checkout, either:
  - test the automatic $10-off flow as-is, or
  - enter a real Stripe promo code to test code-based discounts too
- Complete checkout and confirm the paid amount on success/order details

Technical notes
- I verified the backend already has a real lead for `Ryan@hyperdrivelab.com` with:
  - preview token: `TEST-DISCOUNT-2026-RYAN`
  - valid preview song URL
  - valid full song URL
- `lead_followup_enabled=false` only affects automated sending; it does not stop a manual `?followup=true` test link from working
- `vday10_enabled=false`, so the Valentine link path is currently inactive
