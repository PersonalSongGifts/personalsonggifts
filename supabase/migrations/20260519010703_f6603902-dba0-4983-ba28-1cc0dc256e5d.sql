ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS song_history jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.leads  ADD COLUMN IF NOT EXISTS song_history jsonb NOT NULL DEFAULT '[]'::jsonb;