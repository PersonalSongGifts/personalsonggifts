

## Auto-drain Flash20 queue every few minutes

You sent the canary (~100). Right now nothing happens unless someone clicks "Run Next Batch" again. Let's automate the drain.

### What changes

Add a **pg_cron job** that calls `send-flash20-remarketing` every 5 minutes with `{ send: true }`. Each tick the function will:

- No-op if `paused = true` (already built-in)
- No-op if zero eligible leads remain (already built-in)
- Otherwise send up to `batch_size` (currently 500), then exit

So with ~5,400 eligible leads, the queue drains in ~11 ticks (~55 minutes). Pause anytime from the panel and the cron stops sending immediately.

### Implementation

1. **Enable** `pg_cron` and `pg_net` extensions (no-op if already enabled).

2. **Schedule the job** via insert SQL (not migration — contains the project URL + anon key):
   ```
   select cron.schedule(
     'flash20-drain',
     '*/5 * * * *',
     $$ select net.http_post(
       url:='https://kjyhxodusvodkknmgmra.supabase.co/functions/v1/send-flash20-remarketing',
       headers:='{"Content-Type":"application/json","x-admin-password":"<ADMIN_PASSWORD>"}'::jsonb,
       body:='{"send":true}'::jsonb
     ); $$
   );
   ```

3. **UI affordance** — small "Auto-drain: ON (every 5 min)" badge in the Flash20 panel header so you can see at a glance that the cron is running. Pausing the campaign continues to halt sends; if you want to fully stop the cron, I'll add a one-click "Stop auto-drain" button that runs `cron.unschedule('flash20-drain')`.

4. **Short delay between batches** is already in place (500ms between 50-email chunks inside one batch). The 5-minute cron interval gives Brevo extra breathing room between batches.

### What you do after this ships

Nothing. Leave the panel alone. The remaining ~5,300 leads will drain over the next hour. Stats in the panel auto-refresh when you reload it. If anything looks off mid-flight, click **Pause** and the next cron tick becomes a no-op.

### Out of scope

- Not changing eligibility, pacing within a batch, suppression logic, or the email itself
- Not touching the Valentine remarketing panel or other campaigns
- Not adding retries beyond what's already there — failed sends already roll back the claim and become eligible again on the next tick

