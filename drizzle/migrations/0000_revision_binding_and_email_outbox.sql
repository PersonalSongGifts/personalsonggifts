-- Revision binding + email outbox (additive only).
-- Source of truth: docs/revision-hardening/001_revision_binding_and_email_outbox.sql.txt

-- 1. Binding columns (nullable, additive)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS bound_revision_request_id uuid REFERENCES public.revision_requests(id),
  ADD COLUMN IF NOT EXISTS bound_revision_at timestamptz,
  ADD COLUMN IF NOT EXISTS bound_revision_task_id text,
  ADD COLUMN IF NOT EXISTS bound_revision_bonus_task_id text,
  ADD COLUMN IF NOT EXISTS bound_revision_generation_id uuid;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS bound_revision_request_id uuid REFERENCES public.revision_requests(id),
  ADD COLUMN IF NOT EXISTS bound_revision_at timestamptz,
  ADD COLUMN IF NOT EXISTS bound_revision_task_id text,
  ADD COLUMN IF NOT EXISTS bound_revision_bonus_task_id text,
  ADD COLUMN IF NOT EXISTS bound_revision_generation_id uuid;

-- Additive backfill so revisions already in flight keep working after deploy.
UPDATE public.leads l
   SET bound_revision_request_id = r.id,
       bound_revision_at = r.submitted_at
  FROM (
    SELECT DISTINCT ON (lead_id) id, lead_id, submitted_at
      FROM public.revision_requests
     WHERE lead_id IS NOT NULL AND status = 'approved'
     ORDER BY lead_id, submitted_at DESC
  ) r
 WHERE r.lead_id = l.id AND l.bound_revision_request_id IS NULL;

UPDATE public.orders o
   SET bound_revision_request_id = r.id,
       bound_revision_at = r.submitted_at
  FROM (
    SELECT DISTINCT ON (order_id) id, order_id, submitted_at
      FROM public.revision_requests
     WHERE order_id IS NOT NULL AND status = 'approved'
     ORDER BY order_id, submitted_at DESC
  ) r
 WHERE r.order_id = o.id AND o.bound_revision_request_id IS NULL;

-- 2. Internal helper: apply a validated jsonb patch to one row of a table.
CREATE OR REPLACE FUNCTION public.apply_entity_patch(
  p_table text,
  p_id uuid,
  p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cols text;
  v_key text;
  v_valid text[] := '{}';
BEGIN
  IF p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    RETURN;
  END IF;
  IF p_table NOT IN ('leads', 'orders') THEN
    RAISE EXCEPTION 'apply_entity_patch: unsupported table %', p_table;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = p_table AND column_name = v_key
    ) THEN
      v_valid := v_valid || v_key;
    ELSE
      RAISE EXCEPTION 'apply_entity_patch: unknown column %.%', p_table, v_key;
    END IF;
  END LOOP;

  SELECT string_agg(quote_ident(c), ', ') INTO v_cols FROM unnest(v_valid) AS c;

  EXECUTE format(
    'UPDATE public.%I SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)) WHERE id = $2',
    p_table, v_cols, v_cols, p_table
  ) USING p_patch, p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_entity_patch(text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_entity_patch(text, uuid, jsonb) TO service_role;

-- 3. Atomic claim: entity locked FIRST, then the request row.
CREATE OR REPLACE FUNCTION public.claim_revision_binding(
  p_entity_type text,
  p_entity_id uuid,
  p_request_id uuid,
  p_expected_revision_count integer,
  p_entity_updates jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (result text, bound_request_id uuid, revision_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_table text;
  v_owner_col text;
  v_status text;
  v_count integer;
  v_max integer;
  v_order_id uuid;
  v_entity_status text;
  v_bound uuid;
  v_req_status text;
  v_req_owner uuid;
BEGIN
  IF p_entity_type = 'lead' THEN
    v_table := 'leads';
    v_owner_col := 'lead_id';
  ELSIF p_entity_type = 'order' THEN
    v_table := 'orders';
    v_owner_col := 'order_id';
  ELSE
    RETURN QUERY SELECT 'not_eligible'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  IF v_table = 'leads' THEN
    SELECT l.revision_status, l.revision_count, l.max_revisions, l.order_id, l.status, l.bound_revision_request_id
      INTO v_status, v_count, v_max, v_order_id, v_entity_status, v_bound
      FROM public.leads l WHERE l.id = p_entity_id FOR UPDATE;
  ELSE
    SELECT o.revision_status, o.revision_count, o.max_revisions, NULL::uuid, o.status, o.bound_revision_request_id
      INTO v_status, v_count, v_max, v_order_id, v_entity_status, v_bound
      FROM public.orders o WHERE o.id = p_entity_id FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_eligible'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  SELECT rr.status,
         CASE WHEN v_owner_col = 'lead_id' THEN rr.lead_id ELSE rr.order_id END
    INTO v_req_status, v_req_owner
    FROM public.revision_requests rr WHERE rr.id = p_request_id FOR UPDATE;

  IF v_req_status IS NULL OR v_req_owner IS DISTINCT FROM p_entity_id THEN
    RETURN QUERY SELECT 'missing_request'::text, NULL::uuid, v_count;
    RETURN;
  END IF;

  IF v_req_status <> 'pending' THEN
    IF v_req_status = 'approved' AND v_bound = p_request_id THEN
      RETURN QUERY SELECT 'claimed'::text, p_request_id, v_count;
      RETURN;
    END IF;
    RETURN QUERY SELECT 'request_not_pending'::text, v_bound, v_count;
    RETURN;
  END IF;

  IF p_entity_type = 'lead' AND (v_order_id IS NOT NULL OR v_entity_status = 'converted') THEN
    RETURN QUERY SELECT 'purchased'::text, v_bound, v_count;
    RETURN;
  END IF;

  IF p_entity_type = 'order' AND v_entity_status IN ('refunded', 'cancelled') THEN
    RETURN QUERY SELECT 'not_eligible'::text, v_bound, v_count;
    RETURN;
  END IF;

  IF lower(coalesce(v_status, '')) IN ('processing', 'pending', 'approved') THEN
    RETURN QUERY SELECT 'already_bound'::text, v_bound, v_count;
    RETURN;
  END IF;

  IF coalesce(v_count, 0) IS DISTINCT FROM coalesce(p_expected_revision_count, 0) THEN
    RETURN QUERY SELECT 'not_eligible'::text, v_bound, v_count;
    RETURN;
  END IF;

  IF coalesce(v_count, 0) >= coalesce(v_max, 1) THEN
    RETURN QUERY SELECT 'no_allowance'::text, v_bound, v_count;
    RETURN;
  END IF;

  IF v_owner_col = 'lead_id' THEN
    UPDATE public.revision_requests SET status = 'superseded'
     WHERE lead_id = p_entity_id AND status = 'approved' AND id <> p_request_id;
  ELSE
    UPDATE public.revision_requests SET status = 'superseded'
     WHERE order_id = p_entity_id AND status = 'approved' AND id <> p_request_id;
  END IF;

  UPDATE public.revision_requests
     SET status = 'approved', reviewed_at = now(), reviewed_by = 'auto'
   WHERE id = p_request_id;

  PERFORM public.apply_entity_patch(v_table, p_entity_id, p_entity_updates);

  IF v_table = 'leads' THEN
    UPDATE public.leads
       SET revision_status = 'processing',
           revision_requested_at = now(),
           revision_count = coalesce(public.leads.revision_count, 0) + 1,
           pending_revision = true,
           bound_revision_request_id = p_request_id,
           bound_revision_at = now(),
           bound_revision_task_id = NULL,
           bound_revision_bonus_task_id = NULL,
           bound_revision_generation_id = NULL
     WHERE public.leads.id = p_entity_id
    RETURNING public.leads.revision_count INTO v_count;
  ELSE
    UPDATE public.orders
       SET revision_status = 'processing',
           revision_requested_at = now(),
           revision_count = coalesce(public.orders.revision_count, 0) + 1,
           pending_revision = true,
           bound_revision_request_id = p_request_id,
           bound_revision_at = now(),
           bound_revision_task_id = NULL,
           bound_revision_bonus_task_id = NULL,
           bound_revision_generation_id = NULL
     WHERE public.orders.id = p_entity_id
    RETURNING public.orders.revision_count INTO v_count;
  END IF;

  RETURN QUERY SELECT 'claimed'::text, p_request_id, v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_revision_binding(text, uuid, uuid, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_revision_binding(text, uuid, uuid, integer, jsonb) TO service_role;

-- 4. Bounded automatic recovery for a revision that provably never started.
CREATE OR REPLACE FUNCTION public.release_revision_binding(
  p_entity_type text,
  p_entity_id uuid,
  p_request_id uuid,
  p_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_task text;
  v_bound uuid;
BEGIN
  IF p_entity_type = 'lead' THEN
    SELECT bound_revision_task_id, bound_revision_request_id INTO v_task, v_bound
      FROM public.leads WHERE id = p_entity_id FOR UPDATE;
  ELSIF p_entity_type = 'order' THEN
    SELECT bound_revision_task_id, bound_revision_request_id INTO v_task, v_bound
      FROM public.orders WHERE id = p_entity_id FOR UPDATE;
  ELSE
    RETURN 'unsupported_entity';
  END IF;

  IF v_bound IS DISTINCT FROM p_request_id THEN
    RETURN 'not_bound';
  END IF;
  IF v_task IS NOT NULL THEN
    RETURN 'task_in_flight';
  END IF;

  UPDATE public.revision_requests
     SET status = 'rejected', rejection_reason = coalesce(p_reason, 'automatic release')
   WHERE id = p_request_id AND status = 'approved';

  IF p_entity_type = 'lead' THEN
    UPDATE public.leads
       SET revision_status = NULL,
           pending_revision = false,
           revision_count = greatest(coalesce(revision_count, 1) - 1, 0),
           bound_revision_request_id = NULL,
           bound_revision_at = NULL
     WHERE id = p_entity_id;
  ELSE
    UPDATE public.orders
       SET revision_status = NULL,
           pending_revision = false,
           revision_count = greatest(coalesce(revision_count, 1) - 1, 0),
           bound_revision_request_id = NULL,
           bound_revision_at = NULL
     WHERE id = p_entity_id;
  END IF;

  RETURN 'released';
END;
$$;

REVOKE ALL ON FUNCTION public.release_revision_binding(text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_revision_binding(text, uuid, uuid, text) TO service_role;

-- 5a. Reserve one immutable generation id BEFORE any provider submission.
CREATE OR REPLACE FUNCTION public.reserve_revision_generation(
  p_entity_type text,
  p_entity_id uuid,
  p_request_id uuid,
  p_generation_id uuid
)
RETURNS TABLE (result text, generation_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bound uuid;
  v_gen uuid;
BEGIN
  IF p_entity_type = 'lead' THEN
    SELECT bound_revision_request_id, bound_revision_generation_id INTO v_bound, v_gen
      FROM public.leads WHERE id = p_entity_id FOR UPDATE;
  ELSIF p_entity_type = 'order' THEN
    SELECT bound_revision_request_id, bound_revision_generation_id INTO v_bound, v_gen
      FROM public.orders WHERE id = p_entity_id FOR UPDATE;
  ELSE
    RETURN QUERY SELECT 'no_revision'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_bound IS NULL THEN
    RETURN QUERY SELECT 'no_revision'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_bound <> p_request_id THEN
    RETURN QUERY SELECT 'not_bound'::text, v_gen;
    RETURN;
  END IF;

  IF v_gen IS NOT NULL THEN
    IF v_gen = p_generation_id THEN
      RETURN QUERY SELECT 'reserved'::text, v_gen;
    ELSE
      RETURN QUERY SELECT 'other_generation'::text, v_gen;
    END IF;
    RETURN;
  END IF;

  IF p_entity_type = 'lead' THEN
    UPDATE public.leads SET bound_revision_generation_id = p_generation_id WHERE id = p_entity_id;
  ELSE
    UPDATE public.orders SET bound_revision_generation_id = p_generation_id WHERE id = p_entity_id;
  END IF;
  RETURN QUERY SELECT 'reserved'::text, p_generation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_revision_generation(text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_revision_generation(text, uuid, uuid, uuid) TO service_role;

-- 5b. Attach the first provider task for a (request, generation) pair.
CREATE OR REPLACE FUNCTION public.attach_revision_task(
  p_entity_type text,
  p_entity_id uuid,
  p_request_id uuid,
  p_generation_id uuid,
  p_task_id text,
  p_lane text DEFAULT 'primary'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bound uuid;
  v_gen uuid;
  v_task text;
BEGIN
  IF p_lane NOT IN ('primary', 'bonus') THEN
    RETURN 'identity_mismatch';
  END IF;
  IF p_entity_type = 'lead' THEN
    SELECT bound_revision_request_id, bound_revision_generation_id,
           CASE WHEN p_lane = 'bonus' THEN bound_revision_bonus_task_id ELSE bound_revision_task_id END
      INTO v_bound, v_gen, v_task FROM public.leads WHERE id = p_entity_id FOR UPDATE;
  ELSIF p_entity_type = 'order' THEN
    SELECT bound_revision_request_id, bound_revision_generation_id,
           CASE WHEN p_lane = 'bonus' THEN bound_revision_bonus_task_id ELSE bound_revision_task_id END
      INTO v_bound, v_gen, v_task FROM public.orders WHERE id = p_entity_id FOR UPDATE;
  ELSE
    RETURN 'no_revision';
  END IF;

  IF v_bound IS NULL THEN
    RETURN 'no_revision';
  END IF;
  IF v_bound <> p_request_id OR v_gen IS NULL OR v_gen <> p_generation_id THEN
    RETURN 'identity_mismatch';
  END IF;

  IF v_task IS NOT NULL THEN
    IF v_task = p_task_id THEN
      RETURN 'attached';
    END IF;
    RETURN 'other_task';
  END IF;

  IF p_entity_type = 'lead' THEN
    IF p_lane = 'bonus' THEN
      UPDATE public.leads SET bound_revision_bonus_task_id = p_task_id WHERE id = p_entity_id;
    ELSE
      UPDATE public.leads SET bound_revision_task_id = p_task_id WHERE id = p_entity_id;
    END IF;
  ELSE
    IF p_lane = 'bonus' THEN
      UPDATE public.orders SET bound_revision_bonus_task_id = p_task_id WHERE id = p_entity_id;
    ELSE
      UPDATE public.orders SET bound_revision_task_id = p_task_id WHERE id = p_entity_id;
    END IF;
  END IF;
  RETURN 'attached';
END;
$$;

REVOKE ALL ON FUNCTION public.attach_revision_task(text, uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_revision_task(text, uuid, uuid, uuid, text, text) TO service_role;

-- 5c. READ ONLY. A callback may only ever verify.
CREATE OR REPLACE FUNCTION public.verify_revision_task(
  p_entity_type text,
  p_entity_id uuid,
  p_task_id text,
  p_lane text DEFAULT 'primary'
)
RETURNS TABLE (result text, request_id uuid, generation_id uuid, bound_task_id text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bound uuid;
  v_gen uuid;
  v_task text;
BEGIN
  IF p_lane NOT IN ('primary', 'bonus') THEN
    RETURN QUERY SELECT 'no_revision'::text, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;
  IF p_entity_type = 'lead' THEN
    SELECT bound_revision_request_id, bound_revision_generation_id,
           CASE WHEN p_lane = 'bonus' THEN bound_revision_bonus_task_id ELSE bound_revision_task_id END
      INTO v_bound, v_gen, v_task FROM public.leads WHERE id = p_entity_id;
  ELSIF p_entity_type = 'order' THEN
    SELECT bound_revision_request_id, bound_revision_generation_id,
           CASE WHEN p_lane = 'bonus' THEN bound_revision_bonus_task_id ELSE bound_revision_task_id END
      INTO v_bound, v_gen, v_task FROM public.orders WHERE id = p_entity_id;
  ELSE
    RETURN QUERY SELECT 'no_revision'::text, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF v_bound IS NULL THEN
    RETURN QUERY SELECT 'no_revision'::text, NULL::uuid, v_gen, v_task;
  ELSIF v_task IS NULL THEN
    RETURN QUERY SELECT 'unattached'::text, v_bound, v_gen, NULL::text;
  ELSIF v_task = p_task_id THEN
    RETURN QUERY SELECT 'verified'::text, v_bound, v_gen, v_task;
  ELSE
    RETURN QUERY SELECT 'other_task'::text, v_bound, v_gen, v_task;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_revision_task(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_revision_task(text, uuid, text, text) TO service_role;

DROP FUNCTION IF EXISTS public.bind_revision_task(text, uuid, text);

-- 6. Email outbox: real delivery states, service-role only.
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  provider_idempotency_key uuid,
  provider_key_issued_at timestamptz NOT NULL DEFAULT now(),
  provider_ttl_seconds integer NOT NULL DEFAULT 1800,
  attempt_lease uuid NOT NULL DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  purpose text NOT NULL,
  generation_key text,
  state text NOT NULL DEFAULT 'claimed',
  attempt_count integer NOT NULL DEFAULT 1,
  max_attempts integer NOT NULL DEFAULT 3,
  first_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  accepted_at timestamptz,
  ambiguous_at timestamptz,
  failed_at timestamptz,
  provider_message_id text,
  last_error text,
  recipients jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_outbox
  ADD COLUMN IF NOT EXISTS provider_key_issued_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS provider_ttl_seconds integer NOT NULL DEFAULT 1800,
  ADD COLUMN IF NOT EXISTS attempt_lease uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS first_attempt_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_idempotency_key_uidx
  ON public.email_outbox (idempotency_key);
CREATE INDEX IF NOT EXISTS email_outbox_state_idx
  ON public.email_outbox (state, lease_expires_at);

GRANT ALL ON public.email_outbox TO service_role;
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
-- Deliberately no anon/authenticated policies: internal delivery bookkeeping.

CREATE OR REPLACE FUNCTION public.claim_email_send(
  p_idempotency_key text,
  p_entity_type text,
  p_entity_id uuid,
  p_purpose text,
  p_generation_key text DEFAULT NULL,
  p_recipients jsonb DEFAULT NULL,
  p_max_attempts integer DEFAULT 3,
  p_lease_seconds integer DEFAULT 600,
  p_provider_ttl_seconds integer DEFAULT 1800
)
RETURNS TABLE (
  outbox_id uuid,
  state text,
  attempt_count integer,
  claimed boolean,
  provider_key uuid,
  provider_key_reused boolean,
  lease_token uuid,
  first_attempt_at timestamptz,
  unresolved boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.email_outbox;
  v_within_ttl boolean;
BEGIN
  INSERT INTO public.email_outbox (
    idempotency_key, provider_idempotency_key, provider_key_issued_at, provider_ttl_seconds,
    entity_type, entity_id, purpose, generation_key, recipients, max_attempts, lease_expires_at
  )
  VALUES (
    p_idempotency_key, gen_random_uuid(), now(), coalesce(p_provider_ttl_seconds, 1800),
    p_entity_type, p_entity_id, p_purpose, p_generation_key, p_recipients,
    coalesce(p_max_attempts, 3), now() + make_interval(secs => coalesce(p_lease_seconds, 600))
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NOT NULL THEN
    RETURN QUERY SELECT v_row.id, v_row.state, v_row.attempt_count, true,
                        v_row.provider_idempotency_key, false, v_row.attempt_lease,
                        v_row.first_attempt_at, false;
    RETURN;
  END IF;

  SELECT * INTO v_row FROM public.email_outbox WHERE idempotency_key = p_idempotency_key FOR UPDATE;

  IF v_row.state = 'failed' AND v_row.attempt_count < v_row.max_attempts THEN
    UPDATE public.email_outbox
       SET state = 'claimed',
           attempt_count = public.email_outbox.attempt_count + 1,
           claimed_at = now(),
           lease_expires_at = now() + make_interval(secs => coalesce(p_lease_seconds, 600)),
           failed_at = NULL,
           provider_idempotency_key = gen_random_uuid(),
           provider_key_issued_at = now(),
           attempt_lease = gen_random_uuid(),
           updated_at = now()
     WHERE id = v_row.id
    RETURNING * INTO v_row;
    RETURN QUERY SELECT v_row.id, v_row.state, v_row.attempt_count, true,
                        v_row.provider_idempotency_key, false, v_row.attempt_lease,
                        v_row.first_attempt_at, false;
    RETURN;
  END IF;

  IF v_row.state = 'claimed' AND v_row.lease_expires_at < now() THEN
    v_within_ttl := v_row.provider_key_issued_at
                    > now() - make_interval(secs => coalesce(v_row.provider_ttl_seconds, 1800));

    IF v_within_ttl AND v_row.attempt_count < v_row.max_attempts THEN
      UPDATE public.email_outbox
         SET state = 'claimed',
             attempt_count = public.email_outbox.attempt_count + 1,
             claimed_at = now(),
             lease_expires_at = now() + make_interval(secs => coalesce(p_lease_seconds, 600)),
             attempt_lease = gen_random_uuid(),
             updated_at = now()
       WHERE id = v_row.id
      RETURNING * INTO v_row;
      RETURN QUERY SELECT v_row.id, v_row.state, v_row.attempt_count, true,
                          v_row.provider_idempotency_key, true, v_row.attempt_lease,
                          v_row.first_attempt_at, false;
      RETURN;
    END IF;

    UPDATE public.email_outbox
       SET state = 'ambiguous',
           ambiguous_at = now(),
           last_error = coalesce(v_row.last_error,
             'claim lease expired outside the provider dedupe window; delivery unresolved'),
           updated_at = now()
     WHERE id = v_row.id
    RETURNING * INTO v_row;
    RETURN QUERY SELECT v_row.id, v_row.state, v_row.attempt_count, false,
                        v_row.provider_idempotency_key, false, NULL::uuid,
                        v_row.first_attempt_at, true;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_row.id, v_row.state, v_row.attempt_count, false,
                      v_row.provider_idempotency_key, false, NULL::uuid,
                      v_row.first_attempt_at, (v_row.state = 'ambiguous');
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_send(text, text, uuid, text, text, jsonb, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_email_send(text, text, uuid, text, text, jsonb, integer, integer, integer) TO service_role;
DROP FUNCTION IF EXISTS public.claim_email_send(text, text, uuid, text, text, jsonb, integer, integer, uuid);

CREATE OR REPLACE FUNCTION public.settle_email_send(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_state text,
  p_provider_message_id text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS TABLE (settled boolean, state text, stale_lease boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.email_outbox;
BEGIN
  IF p_state NOT IN ('accepted', 'ambiguous', 'failed') THEN
    RAISE EXCEPTION 'invalid outbox state %', p_state;
  END IF;

  UPDATE public.email_outbox
     SET state = p_state,
         accepted_at = CASE WHEN p_state = 'accepted' THEN now() ELSE accepted_at END,
         ambiguous_at = CASE WHEN p_state = 'ambiguous' THEN now() ELSE ambiguous_at END,
         failed_at = CASE WHEN p_state = 'failed' THEN now() ELSE failed_at END,
         provider_message_id = coalesce(p_provider_message_id, public.email_outbox.provider_message_id),
         last_error = p_error,
         updated_at = now()
   WHERE id = p_outbox_id
     AND public.email_outbox.state = 'claimed'
     AND attempt_lease = p_lease_token
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.email_outbox WHERE id = p_outbox_id;
    RETURN QUERY SELECT false, v_row.state,
                        (v_row.id IS NOT NULL AND v_row.attempt_lease <> p_lease_token);
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_row.state, false;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_email_send(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_email_send(uuid, uuid, text, text, text) TO service_role;
DROP FUNCTION IF EXISTS public.settle_email_send(uuid, text, text, text);