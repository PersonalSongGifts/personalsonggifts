-- Add email override and CC columns for orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS customer_email_override text,
ADD COLUMN IF NOT EXISTS customer_email_cc text,
ADD COLUMN IF NOT EXISTS sent_to_emails jsonb;

-- Add email override and CC columns for leads
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS lead_email_override text,
ADD COLUMN IF NOT EXISTS lead_email_cc text,
ADD COLUMN IF NOT EXISTS preview_sent_to_emails jsonb;

-- Add comments for documentation
COMMENT ON COLUMN public.orders.customer_email_override IS 'Optional override for delivery email address (admin use)';
COMMENT ON COLUMN public.orders.customer_email_cc IS 'Optional CC email for delivery (admin use)';
COMMENT ON COLUMN public.orders.sent_to_emails IS 'Array of email addresses used in previous sends for idempotency tracking';
COMMENT ON COLUMN public.leads.lead_email_override IS 'Optional override for preview email address (admin use)';
COMMENT ON COLUMN public.leads.lead_email_cc IS 'Optional CC email for preview (admin use)';
COMMENT ON COLUMN public.leads.preview_sent_to_emails IS 'Array of email addresses used in previous preview sends for idempotency tracking';