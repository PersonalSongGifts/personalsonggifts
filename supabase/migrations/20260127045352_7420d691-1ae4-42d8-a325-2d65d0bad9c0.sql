-- Remove the relationship column from orders table
ALTER TABLE public.orders DROP COLUMN IF EXISTS relationship;