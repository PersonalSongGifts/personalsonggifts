ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS rush_addon boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rush_price_cents integer,
  ADD COLUMN IF NOT EXISTS rush_alert_sent_at timestamptz;