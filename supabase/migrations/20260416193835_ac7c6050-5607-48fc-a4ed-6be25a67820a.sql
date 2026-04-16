-- Add auto-recovery counter to track watchdog interventions
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS auto_recovery_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS auto_recovery_count integer NOT NULL DEFAULT 0;