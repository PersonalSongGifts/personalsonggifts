
-- Recompute inputs_hash for stuck orders using pgcrypto and reset delivery_status
-- These orders have stale hashes from before recipient_name_pronunciation and lyrics_language_code were added

DO $$
DECLARE
  r RECORD;
  combined TEXT;
  new_hash TEXT;
BEGIN
  FOR r IN
    SELECT id, recipient_name, recipient_name_pronunciation, special_qualities,
           favorite_memory, genre, occasion, singer_preference, lyrics_language_code
    FROM orders
    WHERE delivery_status = 'needs_review'
      AND delivery_last_error = 'Inputs changed after generation'
      AND dismissed_at IS NULL
  LOOP
    -- Build the same pipe-delimited string that computeInputsHash uses (8 fields, trimmed)
    combined := TRIM(COALESCE(r.recipient_name, '')) || '|' ||
                TRIM(COALESCE(r.recipient_name_pronunciation, '')) || '|' ||
                TRIM(COALESCE(r.special_qualities, '')) || '|' ||
                TRIM(COALESCE(r.favorite_memory, '')) || '|' ||
                TRIM(COALESCE(r.genre, '')) || '|' ||
                TRIM(COALESCE(r.occasion, '')) || '|' ||
                TRIM(COALESCE(r.singer_preference, '')) || '|' ||
                TRIM(COALESCE(r.lyrics_language_code, 'en'));

    -- SHA-256, first 16 hex chars (matches JS computeInputsHash)
    new_hash := LEFT(encode(digest(combined, 'sha256'), 'hex'), 16);

    UPDATE orders
    SET inputs_hash = new_hash,
        delivery_status = 'pending',
        delivery_last_error = NULL
    WHERE id = r.id;

    RAISE NOTICE 'Fixed order %: new hash = %', r.id, new_hash;
  END LOOP;
END $$;
