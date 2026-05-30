UPDATE orders SET
  song_url = prev_song_url,
  cover_image_url = prev_cover_image_url,
  automation_lyrics = prev_automation_lyrics,
  prev_song_url = NULL,
  prev_cover_image_url = NULL,
  prev_automation_lyrics = NULL
WHERE id = '8ed2b084-63c4-4022-a429-ad024abd8853';

INSERT INTO order_activity_log (entity_type, entity_id, event_type, actor, details, metadata)
VALUES ('order', '8ed2b084-63c4-4022-a429-ad024abd8853', 'order_restored', 'admin',
  'Restored v1 via prev_* swap; v2 dropped per customer request',
  '{"path":"swap","dropped_v2":true}'::jsonb);