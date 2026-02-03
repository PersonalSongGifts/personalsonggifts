-- Add automation_audio_url_source column to track which audio URL field was used during extraction
-- This helps debugging when Suno callback format varies

ALTER TABLE leads ADD COLUMN IF NOT EXISTS automation_audio_url_source text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS automation_audio_url_source text;

-- Add comments for documentation
COMMENT ON COLUMN leads.automation_audio_url_source IS 'Tracks which audio URL field (e.g., audioUrl, source_audio_url) was successfully extracted from Suno callback';
COMMENT ON COLUMN orders.automation_audio_url_source IS 'Tracks which audio URL field (e.g., audioUrl, source_audio_url) was successfully extracted from Suno callback';