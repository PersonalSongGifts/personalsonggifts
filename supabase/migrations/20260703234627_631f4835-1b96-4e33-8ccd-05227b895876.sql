ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS album_cover_bonus_url text,
  ADD COLUMN IF NOT EXISTS album_cover_bonus_status text,
  ADD COLUMN IF NOT EXISTS album_cover_bonus_task_id text;