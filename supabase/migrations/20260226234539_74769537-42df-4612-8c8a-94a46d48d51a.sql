
-- Add revision columns to orders table
ALTER TABLE public.orders
  ADD COLUMN revision_token UUID DEFAULT gen_random_uuid(),
  ADD COLUMN revision_count INTEGER DEFAULT 0,
  ADD COLUMN max_revisions INTEGER DEFAULT 1,
  ADD COLUMN revision_requested_at TIMESTAMPTZ,
  ADD COLUMN revision_status TEXT,
  ADD COLUMN revision_reason TEXT,
  ADD COLUMN pending_revision BOOLEAN DEFAULT false;

-- Create unique index on revision_token for fast lookups
CREATE UNIQUE INDEX idx_orders_revision_token ON public.orders (revision_token);

-- Create revision_requests table
CREATE TABLE public.revision_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  admin_modifications JSONB,
  rejection_reason TEXT,
  is_pre_delivery BOOLEAN NOT NULL DEFAULT false,
  changes_summary TEXT NOT NULL DEFAULT '',
  original_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  fields_changed JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Customer-submitted fields
  recipient_name TEXT,
  customer_name TEXT,
  delivery_email TEXT,
  recipient_type TEXT,
  occasion TEXT,
  genre TEXT,
  singer_preference TEXT,
  language TEXT,
  recipient_name_pronunciation TEXT,
  special_qualities TEXT,
  favorite_memory TEXT,
  special_message TEXT,
  style_notes TEXT,
  tempo TEXT,
  anything_else TEXT
);

-- Enable RLS on revision_requests (deny all public access, service role only)
ALTER TABLE public.revision_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No public access to revision_requests"
  ON public.revision_requests
  AS RESTRICTIVE
  FOR ALL
  USING (false);
