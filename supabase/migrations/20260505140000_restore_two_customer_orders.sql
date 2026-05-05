-- Manual restore for two customer orders (see .lovable/plan.md Step 1).

-- Order BCB897CC: seed prev_* from original lead song so Restore button appears.
UPDATE orders
SET
  prev_song_url = 'https://kjyhxodusvodkknmgmra.supabase.co/storage/v1/object/public/songs/leads/14688E56-full.mp3',
  prev_automation_lyrics = (SELECT automation_lyrics FROM leads WHERE id = '14688e56-67cc-4f0b-81d6-13c40fa7cdd0'),
  prev_cover_image_url = 'https://kjyhxodusvodkknmgmra.supabase.co/storage/v1/object/public/songs/leads/14688E56-cover.jpg'
WHERE id = 'bcb897cc-4c61-4a5c-a7c4-2bf0861bcd34'
  AND prev_song_url IS NULL;

INSERT INTO order_activity_log (entity_type, entity_id, event_type, actor, details)
VALUES ('order','bcb897cc-4c61-4a5c-a7c4-2bf0861bcd34','prev_version_recovered','admin',
  'Manually restored lead-original snapshot (lead 14688E56) into prev_* slots.');

-- Order 0596AA4A: copy lead assets onto order, mark delivered, seed prev_*.
UPDATE orders o
SET
  song_url = l.full_song_url,
  song_title = l.song_title,
  cover_image_url = l.cover_image_url,
  automation_lyrics = l.automation_lyrics,
  automation_status = 'completed',
  automation_style_id = l.automation_style_id,
  automation_audio_url_source = l.automation_audio_url_source,
  inputs_hash = l.inputs_hash,
  generated_at = l.generated_at,
  status = 'delivered',
  delivered_at = now(),
  prev_song_url = l.full_song_url,
  prev_automation_lyrics = l.automation_lyrics,
  prev_cover_image_url = l.cover_image_url,
  source = 'lead_conversion',
  delivery_status = NULL
FROM leads l
WHERE o.id = '0596aa4a-bd23-4007-a096-2fa6853216e8'
  AND l.id = '7197a807-6ff2-4072-9abf-1a98c31b38ed'
  AND o.song_url IS NULL;

UPDATE leads
SET order_id = '0596aa4a-bd23-4007-a096-2fa6853216e8',
    status = 'converted',
    converted_at = COALESCE(converted_at, now())
WHERE id = '7197a807-6ff2-4072-9abf-1a98c31b38ed';

INSERT INTO order_activity_log (entity_type, entity_id, event_type, actor, details)
VALUES ('order','0596aa4a-bd23-4007-a096-2fa6853216e8','lead_assets_recovered','admin',
  'Manually copied lead 7197A807 assets onto order (webhook missed due to inputs_hash mismatch).');
