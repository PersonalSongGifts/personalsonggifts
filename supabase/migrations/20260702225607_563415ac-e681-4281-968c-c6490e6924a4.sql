ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS album_cover_photo_url text,
  ADD COLUMN IF NOT EXISTS album_cover_url text,
  ADD COLUMN IF NOT EXISTS album_cover_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS album_cover_task_id text;