
CREATE TABLE public.song_tips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  customer_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX idx_song_tips_order_id ON public.song_tips(order_id);
CREATE INDEX idx_song_tips_status ON public.song_tips(status);

ALTER TABLE public.song_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No public access to song_tips"
  ON public.song_tips
  FOR ALL
  USING (false)
  WITH CHECK (false);
