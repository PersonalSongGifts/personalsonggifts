-- Add preview_scheduled_at column to track auto-send time
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS preview_scheduled_at TIMESTAMP WITH TIME ZONE;