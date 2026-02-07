-- Add price_cents column to orders (canonical price in cents from Stripe)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS price_cents integer;

-- Backfill existing orders: convert dollar integers to cents
UPDATE orders SET price_cents = price * 100 WHERE price_cents IS NULL AND price IS NOT NULL;