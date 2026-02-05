-- Add source column to track order origin
ALTER TABLE orders ADD COLUMN source TEXT DEFAULT 'direct';

-- Backfill existing lead conversions based on notes field patterns
UPDATE orders 
SET source = 'lead_conversion' 
WHERE notes LIKE 'lead_session:%' 
   OR notes LIKE '%Manual conversion from lead%';