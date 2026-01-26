-- Create orders table for song orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  pricing_tier TEXT NOT NULL,
  price INTEGER NOT NULL,
  expected_delivery TIMESTAMP WITH TIME ZONE,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  recipient_type TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  occasion TEXT NOT NULL,
  genre TEXT NOT NULL,
  singer_preference TEXT NOT NULL,
  relationship TEXT NOT NULL,
  special_qualities TEXT NOT NULL,
  favorite_memory TEXT NOT NULL,
  special_message TEXT,
  song_url TEXT,
  delivered_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  device_type TEXT
);

-- Enable Row Level Security
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Create policy for inserting orders (anyone can place an order)
CREATE POLICY "Anyone can insert orders" 
ON public.orders 
FOR INSERT 
WITH CHECK (true);

-- Create policy for selecting orders (for future admin/customer lookup - currently restricted)
CREATE POLICY "Orders are not publicly readable" 
ON public.orders 
FOR SELECT 
USING (false);

-- Add index on status for efficient filtering
CREATE INDEX idx_orders_status ON public.orders(status);

-- Add index on customer_email for customer lookup
CREATE INDEX idx_orders_customer_email ON public.orders(customer_email);

-- Add index on created_at for chronological queries
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);