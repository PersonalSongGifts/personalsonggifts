
-- Insert FLASH20 promo (inactive — activated by edge function on first send)
INSERT INTO public.promotions (
  slug, name, lead_price_cents, standard_price_cents, priority_price_cents,
  is_active, show_banner, starts_at, ends_at, email_leads
)
VALUES (
  'flash20', 'Flash $19.99 (72h)', 1999, 9999, 15999,
  false, false, now(), now() + interval '72 hours', false
)
ON CONFLICT (slug) DO NOTHING;

-- Seed admin_settings row for flash20 campaign (starts paused)
INSERT INTO public.admin_settings (key, value, updated_at)
VALUES (
  'flash20_remarketing',
  '{"paused":true,"batch_size":500,"canary_size":100,"canary_sent":false,"total_sent":0,"activated_at":null,"last_run_at":null}',
  now()
)
ON CONFLICT (key) DO NOTHING;
