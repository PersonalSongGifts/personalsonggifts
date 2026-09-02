alter table public.orders
  add column if not exists bonus_offer_email_sent_at timestamptz,
  add column if not exists download_offer_email_sent_at timestamptz;

insert into public.admin_settings (key, value) values
  ('customer_offer_bonus_enabled', 'false'),
  ('customer_offer_download_enabled', 'false')
on conflict (key) do nothing;