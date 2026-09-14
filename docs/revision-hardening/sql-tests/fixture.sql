-- Minimal SYNTHETIC schema fixture for exercising
-- docs/revision-hardening/001_revision_binding_and_email_outbox.sql.txt
-- in an isolated in-process PostgreSQL engine (PGlite).
--
-- No customer data, no secrets, no production connection. Only the columns the
-- migration touches are modelled.

CREATE SCHEMA IF NOT EXISTS public;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
END $$;

CREATE TABLE public.revision_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid,
  order_id uuid,
  status text NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text,
  rejection_reason text,
  style_notes text,
  tempo text,
  anything_else text
);

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text,
  order_id uuid,
  recipient_name text,
  recipient_name_pronunciation text,
  genre text,
  revision_status text,
  revision_requested_at timestamptz,
  revision_count integer DEFAULT 0,
  max_revisions integer DEFAULT 1,
  pending_revision boolean DEFAULT false,
  preview_song_url text,
  full_song_url text,
  prev_preview_song_url text,
  automation_status text,
  preview_scheduled_at timestamptz,
  preview_sent_at timestamptz
);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text,
  revision_status text,
  revision_requested_at timestamptz,
  revision_count integer DEFAULT 0,
  max_revisions integer DEFAULT 1,
  pending_revision boolean DEFAULT false,
  song_url text,
  bonus_song_url text
);
