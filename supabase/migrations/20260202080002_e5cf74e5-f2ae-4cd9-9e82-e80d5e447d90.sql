-- Add engagement tracking columns to leads table
ALTER TABLE public.leads
ADD COLUMN preview_played_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN preview_play_count INTEGER DEFAULT 0;

-- Add engagement tracking columns to orders table
ALTER TABLE public.orders
ADD COLUMN song_played_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN song_play_count INTEGER DEFAULT 0,
ADD COLUMN song_downloaded_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN song_download_count INTEGER DEFAULT 0;