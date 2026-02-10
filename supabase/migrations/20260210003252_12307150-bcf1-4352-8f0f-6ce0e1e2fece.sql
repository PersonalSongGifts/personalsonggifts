ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS lyrics_unlocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS lyrics_unlock_session_id text,
  ADD COLUMN IF NOT EXISTS lyrics_unlock_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS lyrics_price_cents integer;