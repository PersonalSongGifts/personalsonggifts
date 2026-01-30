-- Add scheduled delivery column to orders table
ALTER TABLE public.orders 
ADD COLUMN scheduled_delivery_at timestamp with time zone;

-- Add index for efficient scheduled delivery lookups
CREATE INDEX idx_orders_scheduled_delivery 
ON public.orders (scheduled_delivery_at) 
WHERE scheduled_delivery_at IS NOT NULL AND status = 'ready';