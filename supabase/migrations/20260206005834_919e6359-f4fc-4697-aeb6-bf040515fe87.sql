-- Song Language Feature: Add language columns to leads and orders tables

-- Add columns to leads table
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS lyrics_language_code text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS lyrics_language_qa jsonb NULL,
  ADD COLUMN IF NOT EXISTS lyrics_raw_attempt_1 text NULL,
  ADD COLUMN IF NOT EXISTS lyrics_raw_attempt_2 text NULL;

-- Add columns to orders table
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS lyrics_language_code text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS lyrics_language_qa jsonb NULL,
  ADD COLUMN IF NOT EXISTS lyrics_raw_attempt_1 text NULL,
  ADD COLUMN IF NOT EXISTS lyrics_raw_attempt_2 text NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.leads.lyrics_language_code IS 'Language code for lyrics (en, es, fr, de, it, pt-BR, ja, ko, sr, hr)';
COMMENT ON COLUMN public.leads.lyrics_language_qa IS 'QA results including detection method, confidence, issues, and detection_sample';
COMMENT ON COLUMN public.leads.lyrics_raw_attempt_1 IS 'First lyrics generation attempt (capped at 4000 chars)';
COMMENT ON COLUMN public.leads.lyrics_raw_attempt_2 IS 'Second lyrics generation attempt after QA failure (capped at 4000 chars)';

COMMENT ON COLUMN public.orders.lyrics_language_code IS 'Language code for lyrics (en, es, fr, de, it, pt-BR, ja, ko, sr, hr)';
COMMENT ON COLUMN public.orders.lyrics_language_qa IS 'QA results including detection method, confidence, issues, and detection_sample';
COMMENT ON COLUMN public.orders.lyrics_raw_attempt_1 IS 'First lyrics generation attempt (capped at 4000 chars)';
COMMENT ON COLUMN public.orders.lyrics_raw_attempt_2 IS 'Second lyrics generation attempt after QA failure (capped at 4000 chars)';