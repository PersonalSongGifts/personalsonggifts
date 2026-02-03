-- Add column to track scheduled resends for delivered orders
ALTER TABLE orders ADD COLUMN resend_scheduled_at timestamptz;