ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_play_count integer DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_first_played_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_checkout_clicked_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_checkout_click_count integer DEFAULT 0;