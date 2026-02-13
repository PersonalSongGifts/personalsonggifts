
-- Add remarketing tracking column to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_valentine_remarketing_sent_at timestamptz;

-- Create email suppression table
CREATE TABLE IF NOT EXISTS email_suppressions (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;

-- Lock down - only service role can access
CREATE POLICY "No public access to email_suppressions" ON email_suppressions FOR ALL USING (false);
