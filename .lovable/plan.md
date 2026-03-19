

## Create a Test Lead for Discount Code Testing

### Problem
You need a working lead preview page with a real song to test the discount code checkout flow. The test email link uses a dummy token, so it doesn't work for end-to-end testing.

### Plan

**Single database migration** that inserts a test lead row with:
- Email: `Ryan@hyperdrivelab.com`
- Customer name: `Ryan Test`
- Recipient: `Test Buddy` (friend, birthday, pop, male)
- Preview token: `TEST-DISCOUNT-2026-RYAN` (what you'll use in the URL)
- Borrows existing song files from another lead (the 5EFC06ED files already in storage)
- Status: `preview_sent` (so the preview page loads normally)
- `full_song_url` populated (required for checkout to work)

### After migration runs

You'll be able to visit:
```
https://personalsonggifts.lovable.app/preview/TEST-DISCOUNT-2026-RYAN
```

This will load the preview page with a real playable song. You can then:
1. Click "Get Full Song" 
2. On the Stripe checkout page, enter a promo/discount code
3. Verify the discount applies correctly

### Technical details
- One SQL INSERT migration, no code changes needed
- Token is 24 chars (meets the 16-char minimum validation)
- Uses existing audio files so no upload needed

