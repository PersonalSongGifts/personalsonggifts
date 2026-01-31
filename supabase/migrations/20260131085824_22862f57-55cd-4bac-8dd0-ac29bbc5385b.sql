-- Add new columns for lead recovery system
ALTER TABLE leads ADD COLUMN IF NOT EXISTS preview_song_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS full_song_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS song_title TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS preview_token TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS preview_sent_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS preview_opened_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_sent_at TIMESTAMPTZ;

-- Add unique constraint on preview_token for secure lookups
CREATE UNIQUE INDEX IF NOT EXISTS leads_preview_token_unique ON leads(preview_token) WHERE preview_token IS NOT NULL;

-- Sync existing converted leads (match by email)
UPDATE leads l
SET 
  status = 'converted',
  converted_at = o.created_at,
  order_id = o.id
FROM orders o
WHERE LOWER(l.email) = LOWER(o.customer_email)
  AND l.status = 'lead'
  AND l.order_id IS NULL;