ALTER TABLE public.orders ADD COLUMN short_retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN short_retry_count integer NOT NULL DEFAULT 0;