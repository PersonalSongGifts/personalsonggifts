
ALTER TABLE public.song_tips
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_by text;

CREATE UNIQUE INDEX IF NOT EXISTS song_tips_session_unique
  ON public.song_tips(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_song_tips_status_paid_at
  ON public.song_tips(status, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_song_tips_payment_intent
  ON public.song_tips(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
