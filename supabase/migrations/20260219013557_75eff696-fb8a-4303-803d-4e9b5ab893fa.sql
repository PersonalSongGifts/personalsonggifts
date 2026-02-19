-- Add prev_* backup columns to orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS prev_song_url TEXT,
  ADD COLUMN IF NOT EXISTS prev_automation_lyrics TEXT,
  ADD COLUMN IF NOT EXISTS prev_cover_image_url TEXT;

-- Add prev_* backup columns to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS prev_song_url TEXT,
  ADD COLUMN IF NOT EXISTS prev_automation_lyrics TEXT,
  ADD COLUMN IF NOT EXISTS prev_cover_image_url TEXT;