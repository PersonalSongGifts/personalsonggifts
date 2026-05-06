-- Clear leads stuck in audio_generating for >24h (Suno tasks dead, will not recover)
UPDATE public.leads
SET automation_status = 'failed',
    automation_last_error = 'Stuck in audio_generating >24h — auto-cleared by ops to free scheduler slots'
WHERE automation_status IN ('queued','pending','lyrics_generating','audio_generating')
  AND automation_started_at IS NOT NULL
  AND automation_started_at < (now() - interval '24 hours');

-- Also clear leads stuck in 'queued'/'pending' with NULL started_at (orphaned)
UPDATE public.leads
SET automation_status = 'failed',
    automation_last_error = 'Orphaned queued/pending state — auto-cleared by ops'
WHERE automation_status IN ('queued','pending')
  AND automation_started_at IS NULL;