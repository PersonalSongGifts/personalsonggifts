-- Create unique index on notes field where it contains stripe_session
-- This prevents race conditions from creating duplicate orders
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_session_unique 
ON orders ((notes)) 
WHERE notes LIKE 'stripe_session:%';