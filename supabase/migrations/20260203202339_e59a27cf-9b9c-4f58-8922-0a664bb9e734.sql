-- Create unique index on notes field where it contains lead_session
-- This prevents race conditions from creating duplicate orders for lead conversions
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_lead_session_unique 
ON orders ((notes)) 
WHERE notes LIKE 'lead_session:%';