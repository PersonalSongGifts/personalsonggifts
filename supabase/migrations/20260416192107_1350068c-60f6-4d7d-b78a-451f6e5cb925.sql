
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS revision_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS revision_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_revisions integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS revision_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS revision_status text,
  ADD COLUMN IF NOT EXISTS revision_reason text,
  ADD COLUMN IF NOT EXISTS pending_revision boolean DEFAULT false;

UPDATE public.leads SET revision_token = gen_random_uuid() WHERE revision_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS leads_revision_token_key ON public.leads(revision_token);

ALTER TABLE public.revision_requests
  ADD COLUMN IF NOT EXISTS lead_id uuid;

ALTER TABLE public.revision_requests
  ALTER COLUMN order_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'revision_requests_entity_check'
  ) THEN
    ALTER TABLE public.revision_requests
      ADD CONSTRAINT revision_requests_entity_check
      CHECK ((order_id IS NOT NULL AND lead_id IS NULL) OR (order_id IS NULL AND lead_id IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS revision_requests_lead_id_idx ON public.revision_requests(lead_id);
