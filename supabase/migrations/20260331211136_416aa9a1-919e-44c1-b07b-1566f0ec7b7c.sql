
CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  standard_price_cents integer NOT NULL,
  priority_price_cents integer NOT NULL,
  lead_price_cents integer NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  show_banner boolean NOT NULL DEFAULT true,
  banner_text text,
  banner_emoji text,
  email_leads boolean NOT NULL DEFAULT false,
  email_leads_days integer NOT NULL DEFAULT 30,
  email_subject text,
  email_body_template text,
  email_batch_sent integer NOT NULL DEFAULT 0,
  email_batch_total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No public access to promotions"
  ON public.promotions
  FOR ALL
  TO public
  USING (false);

CREATE UNIQUE INDEX idx_promotions_no_overlap
  ON public.promotions (is_active)
  WHERE is_active = true;

ALTER TABLE public.leads
  ADD COLUMN last_promo_email_sent_at timestamptz;
