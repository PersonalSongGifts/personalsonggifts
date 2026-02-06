
-- Add SMS delivery columns to orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS sms_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_status text,
  ADD COLUMN IF NOT EXISTS sms_last_error text,
  ADD COLUMN IF NOT EXISTS sms_sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS sms_scheduled_for timestamp with time zone,
  ADD COLUMN IF NOT EXISTS timezone text;

-- Add SMS delivery columns to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS sms_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_status text,
  ADD COLUMN IF NOT EXISTS sms_last_error text,
  ADD COLUMN IF NOT EXISTS sms_sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS sms_scheduled_for timestamp with time zone,
  ADD COLUMN IF NOT EXISTS timezone text;
