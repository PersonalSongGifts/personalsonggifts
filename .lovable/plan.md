I found the song pages are failing in `get-song-page`, not in the React page itself. The function is repeatedly returning `Failed to fetch order` because the backend client is getting `PGRST002: Could not query the database for the schema cache. Retrying.` Direct database diagnostics also intermittently time out / report database unavailable, while Lovable Cloud status reports healthy.

Plan:
1. Make the smallest backend-only reliability patch in `supabase/functions/get-song-page/index.ts`:
   - Keep the public song-page response shape unchanged.
   - Add short internal retries around the order lookup and the revision setting lookup so transient schema-cache/database hiccups don’t immediately become customer-facing failures.
   - Keep true 404 cases as 404; only retry backend/transient database errors.

2. Deploy only `get-song-page` immediately.

3. Validate with the three customer reference codes shown in the screenshots:
   - `C43D2E4C`
   - `231DA60E`
   - `74980518`
   Confirm the function returns song data instead of `Failed to fetch order`, or report if any specific code is genuinely missing.

4. Do not touch order data, song URLs, revisions, checkout, admin, or frontend copy.