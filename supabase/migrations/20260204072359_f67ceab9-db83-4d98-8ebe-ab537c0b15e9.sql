-- Add recipient_name_pronunciation column to orders table
ALTER TABLE public.orders 
ADD COLUMN recipient_name_pronunciation text DEFAULT NULL;

-- Add recipient_name_pronunciation column to leads table
ALTER TABLE public.leads 
ADD COLUMN recipient_name_pronunciation text DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.orders.recipient_name_pronunciation IS 'Optional phonetic spelling for AI vocals. Used only in lyrics generation, never shown to customers.';
COMMENT ON COLUMN public.leads.recipient_name_pronunciation IS 'Optional phonetic spelling for AI vocals. Used only in lyrics generation, never shown to customers.';