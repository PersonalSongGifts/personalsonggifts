
-- Add bonus track columns to orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS bonus_song_url text,
  ADD COLUMN IF NOT EXISTS bonus_preview_url text,
  ADD COLUMN IF NOT EXISTS bonus_song_title text,
  ADD COLUMN IF NOT EXISTS bonus_cover_image_url text,
  ADD COLUMN IF NOT EXISTS bonus_automation_status text,
  ADD COLUMN IF NOT EXISTS bonus_automation_task_id text,
  ADD COLUMN IF NOT EXISTS bonus_automation_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS bonus_automation_last_error text,
  ADD COLUMN IF NOT EXISTS bonus_unlocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS bonus_unlock_session_id text,
  ADD COLUMN IF NOT EXISTS bonus_unlock_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS bonus_price_cents integer,
  ADD COLUMN IF NOT EXISTS bonus_style_prompt text;

-- Add bonus track columns to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS bonus_song_url text,
  ADD COLUMN IF NOT EXISTS bonus_preview_url text,
  ADD COLUMN IF NOT EXISTS bonus_song_title text,
  ADD COLUMN IF NOT EXISTS bonus_cover_image_url text,
  ADD COLUMN IF NOT EXISTS bonus_automation_status text,
  ADD COLUMN IF NOT EXISTS bonus_automation_task_id text,
  ADD COLUMN IF NOT EXISTS bonus_automation_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS bonus_automation_last_error text,
  ADD COLUMN IF NOT EXISTS bonus_style_prompt text;

-- Add bonus_price_cents to promotions table
ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS bonus_price_cents integer;
