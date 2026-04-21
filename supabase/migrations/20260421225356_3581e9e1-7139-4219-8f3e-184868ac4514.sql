DROP INDEX IF EXISTS public.idx_promotions_no_overlap;
CREATE UNIQUE INDEX idx_promotions_no_overlap_global
  ON public.promotions (is_active)
  WHERE is_active = true AND targeted = false;