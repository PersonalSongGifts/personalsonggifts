CREATE TABLE public.order_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  event_type text NOT NULL,
  actor text NOT NULL DEFAULT 'system',
  details text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_log_entity 
  ON public.order_activity_log (entity_type, entity_id, created_at DESC);

ALTER TABLE public.order_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No public access to activity log"
  ON public.order_activity_log FOR ALL
  USING (false);