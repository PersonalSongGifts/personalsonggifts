
UPDATE public.orders
SET
  prev_song_url = COALESCE(prev_song_url, song_url),
  prev_automation_lyrics = COALESCE(prev_automation_lyrics, automation_lyrics),
  prev_cover_image_url = COALESCE(prev_cover_image_url, cover_image_url),
  song_url = NULL,
  song_title = NULL,
  cover_image_url = NULL,
  automation_status = NULL,
  automation_task_id = NULL,
  automation_lyrics = NULL,
  automation_started_at = NULL,
  automation_retry_count = 0,
  automation_last_error = NULL,
  automation_raw_callback = NULL,
  automation_style_id = NULL,
  automation_audio_url_source = NULL,
  generated_at = NULL,
  inputs_hash = NULL,
  next_attempt_at = NULL,
  automation_manual_override_at = NULL,
  lyrics_language_qa = NULL,
  lyrics_raw_attempt_1 = NULL,
  lyrics_raw_attempt_2 = NULL,
  delivery_status = 'pending',
  sent_at = NULL,
  unplayed_resend_sent_at = NULL,
  revision_status = 'processing',
  earliest_generate_at = now() + interval '1 minute',
  target_send_at = now() + interval '12 hours'
WHERE id IN (
  '51263129-73ec-4d05-ae87-8ce7707b32c4',
  '5f9d3d7c-deb3-4e3c-85c4-8945b620f939',
  '969b47fb-2db3-4b83-94d7-5de0fd5d412c'
);

INSERT INTO public.order_activity_log (entity_type, entity_id, event_type, actor, details, metadata)
SELECT 'order', id, 'revision_manual_retrigger', 'system',
  'Re-triggered regeneration after anything_else contentFields fix',
  jsonb_build_object('reason', 'anything_else was missing from contentFields, revision auto-approved without regen')
FROM public.orders
WHERE id IN (
  '51263129-73ec-4d05-ae87-8ce7707b32c4',
  '5f9d3d7c-deb3-4e3c-85c4-8945b620f939',
  '969b47fb-2db3-4b83-94d7-5de0fd5d412c'
);
