-- Phase 1: Add timing, tracking, and automation columns to leads and orders

-- Leads table additions
ALTER TABLE leads ADD COLUMN IF NOT EXISTS earliest_generate_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS target_send_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS generated_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS automation_raw_callback jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS inputs_hash text;

-- Orders table additions
ALTER TABLE orders ADD COLUMN IF NOT EXISTS earliest_generate_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS target_send_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS generated_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS automation_raw_callback jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS inputs_hash text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_last_error text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_retry_count int DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN leads.earliest_generate_at IS 'UTC timestamp when generation may begin';
COMMENT ON COLUMN leads.target_send_at IS 'UTC timestamp when preview email should be sent (24h after capture)';
COMMENT ON COLUMN leads.generated_at IS 'UTC timestamp when song generation completed';
COMMENT ON COLUMN leads.sent_at IS 'UTC timestamp when preview email was sent';
COMMENT ON COLUMN leads.next_attempt_at IS 'UTC timestamp for next retry attempt after rate limiting';
COMMENT ON COLUMN leads.automation_raw_callback IS 'Full raw Suno callback payload for debugging';
COMMENT ON COLUMN leads.inputs_hash IS 'SHA-256 hash of key input fields for change detection';

COMMENT ON COLUMN orders.earliest_generate_at IS 'UTC timestamp when generation may begin (5 min after creation for stabilization)';
COMMENT ON COLUMN orders.target_send_at IS 'UTC timestamp when delivery email should be sent (12h before expected_delivery)';
COMMENT ON COLUMN orders.generated_at IS 'UTC timestamp when song generation completed';
COMMENT ON COLUMN orders.sent_at IS 'UTC timestamp when delivery email was sent';
COMMENT ON COLUMN orders.next_attempt_at IS 'UTC timestamp for next retry attempt after rate limiting';
COMMENT ON COLUMN orders.automation_raw_callback IS 'Full raw Suno callback payload for debugging';
COMMENT ON COLUMN orders.inputs_hash IS 'SHA-256 hash of key input fields for change detection';
COMMENT ON COLUMN orders.delivery_status IS 'Delivery stage: pending, scheduled, sent, failed, needs_review, permanently_failed';
COMMENT ON COLUMN orders.delivery_last_error IS 'Last delivery error message';
COMMENT ON COLUMN orders.delivery_retry_count IS 'Number of delivery retry attempts';