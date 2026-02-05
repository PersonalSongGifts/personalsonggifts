-- Create playback_errors table for diagnostics
CREATE TABLE public.playback_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entity_type TEXT NOT NULL, -- 'lead' or 'order'
  entity_id UUID NOT NULL,
  error_name TEXT NOT NULL,
  error_message TEXT,
  user_agent TEXT,
  is_online BOOLEAN,
  song_url_host TEXT
);

-- Enable RLS
ALTER TABLE public.playback_errors ENABLE ROW LEVEL SECURITY;

-- Only allow service role to insert (edge function will do this)
CREATE POLICY "Only service role can insert playback_errors"
ON public.playback_errors
FOR INSERT
WITH CHECK (false);

-- No public read access
CREATE POLICY "No public read of playback_errors"
ON public.playback_errors
FOR SELECT
USING (false);

-- Index for analysis
CREATE INDEX idx_playback_errors_created ON public.playback_errors(created_at DESC);
CREATE INDEX idx_playback_errors_name ON public.playback_errors(error_name);