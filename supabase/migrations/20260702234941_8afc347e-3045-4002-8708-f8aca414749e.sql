ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS package_unlocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS package_unlock_session_id text,
  ADD COLUMN IF NOT EXISTS package_unlock_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS package_price_cents integer;