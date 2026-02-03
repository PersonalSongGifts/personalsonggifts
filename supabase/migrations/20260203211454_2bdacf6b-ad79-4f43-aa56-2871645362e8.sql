-- Add dismissed_at column for order cancellation/archival tracking
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;