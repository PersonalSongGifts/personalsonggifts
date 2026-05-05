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

-- ============================================================
-- BACKFILL #1: Lead-converted orders missing prev_song_url
-- Safe: just populates the snapshot slots so Restore button appears.
-- Pulls assets from the matching lead (best-effort by email + recipient).
-- ============================================================
WITH ranked_leads AS (
  SELECT l.email, l.recipient_name, l.full_song_url, l.automation_lyrics, l.cover_image_url, l.captured_at,
         ROW_NUMBER() OVER (PARTITION BY lower(l.email), lower(l.recipient_name) ORDER BY l.captured_at DESC) AS rn
  FROM leads l
  WHERE l.full_song_url IS NOT NULL
)
UPDATE orders o
SET prev_song_url = rl.full_song_url,
    prev_automation_lyrics = COALESCE(o.prev_automation_lyrics, rl.automation_lyrics),
    prev_cover_image_url = COALESCE(o.prev_cover_image_url, rl.cover_image_url)
FROM ranked_leads rl
WHERE o.source = 'lead_conversion'
  AND o.prev_song_url IS NULL
  AND o.created_at >= now() - interval '60 days'
  AND rl.rn = 1
  AND lower(rl.email) = lower(o.customer_email)
  AND lower(rl.recipient_name) = lower(o.recipient_name);


-- ============================================================
-- STRANDED-ORDER LIST: NOT auto-fixed. CS reviews and uses the
-- "Restore Previous Version" / manual asset copy in admin per case.
-- The list is captured below in a one-shot activity-log entry per
-- affected order so the team can find them in Needs Attention.
-- ============================================================
INSERT INTO order_activity_log (entity_type, entity_id, event_type, actor, details, metadata)
SELECT 'order', o.id, 'stranded_lead_match_detected', 'system',
       'Paid order has no song; matching lead with full song exists. CS review required.',
       jsonb_build_object(
         'matched_lead_id', (
           SELECT l.id FROM leads l
           WHERE lower(l.email) = lower(o.customer_email)
             AND lower(l.recipient_name) = lower(o.recipient_name)
             AND l.full_song_url IS NOT NULL
             AND l.captured_at BETWEEN o.created_at - interval '24 hours' AND o.created_at + interval '1 hour'
           ORDER BY l.captured_at DESC LIMIT 1
         )
       )
FROM orders o
WHERE o.song_url IS NULL
  AND o.status IN ('paid','delivered','ready')
  AND o.created_at >= now() - interval '30 days'
  AND EXISTS (
    SELECT 1 FROM leads l
    WHERE lower(l.email) = lower(o.customer_email)
      AND lower(l.recipient_name) = lower(o.recipient_name)
      AND l.full_song_url IS NOT NULL
      AND l.captured_at BETWEEN o.created_at - interval '24 hours' AND o.created_at + interval '1 hour'
  )
  AND NOT EXISTS (
    SELECT 1 FROM order_activity_log al
    WHERE al.entity_id = o.id AND al.event_type = 'stranded_lead_match_detected'
  );
