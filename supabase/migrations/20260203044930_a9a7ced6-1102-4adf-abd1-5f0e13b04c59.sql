-- Add automation columns to existing leads table
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS automation_status text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS automation_task_id text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS automation_retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS automation_last_error text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS automation_started_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS automation_lyrics text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS automation_style_id uuid DEFAULT NULL,
ADD COLUMN IF NOT EXISTS automation_manual_override_at timestamptz DEFAULT NULL;

-- Create song_styles table for Suno prompt library
CREATE TABLE public.song_styles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label text NOT NULL,
  genre_match text NOT NULL,
  vocal_gender text NOT NULL CHECK (vocal_gender IN ('male', 'female')),
  suno_prompt text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on song_styles (read-only for service role, admin via edge functions)
ALTER TABLE public.song_styles ENABLE ROW LEVEL SECURITY;

-- song_styles is managed by edge functions with service role, no public access
CREATE POLICY "No public access to song_styles"
ON public.song_styles
FOR ALL
USING (false);

-- Create admin_settings table for configurable automation threshold
CREATE TABLE public.admin_settings (
  key text NOT NULL PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on admin_settings
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- admin_settings is managed by edge functions with service role, no public access
CREATE POLICY "No public access to admin_settings"
ON public.admin_settings
FOR ALL
USING (false);

-- Insert default quality threshold setting
INSERT INTO public.admin_settings (key, value)
VALUES ('automation_quality_threshold', '65');

-- Add foreign key constraint for automation_style_id
ALTER TABLE public.leads
ADD CONSTRAINT leads_automation_style_id_fkey 
FOREIGN KEY (automation_style_id) REFERENCES public.song_styles(id);

-- Create index on automation_status for efficient filtering
CREATE INDEX IF NOT EXISTS idx_leads_automation_status ON public.leads (automation_status);

-- Create index on song_styles for genre matching
CREATE INDEX IF NOT EXISTS idx_song_styles_genre_vocal ON public.song_styles (genre_match, vocal_gender, is_active);