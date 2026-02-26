CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON public.orders (customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_automation_status ON public.orders (automation_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads (email);
CREATE INDEX IF NOT EXISTS idx_leads_automation_status ON public.leads (automation_status);
CREATE INDEX IF NOT EXISTS idx_leads_captured_at_desc ON public.leads (captured_at DESC);