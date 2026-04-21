ALTER TABLE public.promotions ADD COLUMN IF NOT EXISTS targeted boolean NOT NULL DEFAULT false;
UPDATE public.promotions SET targeted = true WHERE slug = 'flash20';