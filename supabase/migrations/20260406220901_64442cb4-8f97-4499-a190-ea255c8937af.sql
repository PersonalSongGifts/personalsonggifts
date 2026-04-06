ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS download_unlocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS download_unlock_session_id text,
  ADD COLUMN IF NOT EXISTS download_unlock_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS download_price_cents integer;

-- Grandfather all existing orders: give them free download access
UPDATE public.orders SET download_unlocked_at = now() WHERE download_unlocked_at IS NULL;