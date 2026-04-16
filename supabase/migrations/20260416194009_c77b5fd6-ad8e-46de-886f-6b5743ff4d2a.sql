UPDATE public.orders
SET automation_status = 'pending',
    automation_lyrics = NULL,
    automation_last_error = NULL,
    automation_task_id = NULL,
    automation_started_at = NULL,
    short_retry_count = 0,
    auto_recovery_count = auto_recovery_count + 1,
    next_attempt_at = NULL
WHERE automation_status = 'needs_review'
  AND dismissed_at IS NULL
  AND status != 'cancelled'
  AND song_url IS NULL
  AND (automation_last_error ILIKE '%lyrics extension%'
       OR (automation_last_error ILIKE '%too short%' AND short_retry_count = 0));

INSERT INTO public.order_activity_log (entity_type, entity_id, event_type, actor, details)
SELECT 'order', id, 'auto_recovered_from_needs_review', 'system',
       'One-time backfill: rescued from legacy needs_review state'
FROM public.orders
WHERE auto_recovery_count = 1
  AND automation_status = 'pending'
  AND song_url IS NULL;