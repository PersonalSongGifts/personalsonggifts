-- Add automation tracking columns to orders table (mirroring leads)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS automation_status text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS automation_task_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS automation_lyrics text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS automation_started_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS automation_retry_count integer DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS automation_last_error text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS automation_style_id uuid REFERENCES song_styles(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS automation_manual_override_at timestamptz;