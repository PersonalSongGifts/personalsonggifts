
CREATE INDEX IF NOT EXISTS idx_leads_automation_task_id
  ON public.leads (automation_task_id)
  WHERE automation_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_automation_task_id
  ON public.orders (automation_task_id)
  WHERE automation_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_revision_requests_order_id
  ON public.revision_requests (order_id);
