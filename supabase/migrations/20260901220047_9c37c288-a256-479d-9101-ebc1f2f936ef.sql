alter table public.leads
  add column if not exists follow_up_2_sent_at timestamptz,
  add column if not exists follow_up_3_sent_at timestamptz,
  add column if not exists followup_completed_at timestamptz;

create index if not exists leads_followup_stage_idx on public.leads (follow_up_sent_at, follow_up_2_sent_at, follow_up_3_sent_at) where dismissed_at is null;

insert into public.admin_settings (key, value) values
  ('lead_followup_2_enabled', 'false'),
  ('lead_followup_3_enabled', 'false')
on conflict (key) do nothing;