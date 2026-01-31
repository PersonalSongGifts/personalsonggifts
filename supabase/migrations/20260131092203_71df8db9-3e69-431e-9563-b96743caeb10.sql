-- Add quality_score column to leads table
ALTER TABLE public.leads 
ADD COLUMN quality_score INTEGER NULL;

-- Create a function to calculate quality score for existing leads
-- This will be used for backfilling and can be called from edge functions via RPC if needed
CREATE OR REPLACE FUNCTION public.calculate_lead_quality_score(
  p_special_qualities TEXT,
  p_favorite_memory TEXT,
  p_email TEXT,
  p_phone TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 0;
  sq TEXT;
  fm TEXT;
  combined TEXT;
  email_domain TEXT;
  sq_len INTEGER;
  fm_len INTEGER;
  meaningful_words TEXT[] := ARRAY['love', 'heart', 'memory', 'always', 'together', 
    'beautiful', 'special', 'amazing', 'best', 'happy', 'wonderful', 'caring',
    'family', 'friend', 'forever', 'remember', 'moment', 'laugh', 'smile', 
    'thank', 'years', 'life', 'time', 'first', 'day', 'night', 'morning',
    'birthday', 'anniversary', 'wedding', 'valentine', 'mother', 'father',
    'wife', 'husband', 'daughter', 'son', 'grandma', 'grandpa', 'baby'];
  disposable_domains TEXT[] := ARRAY['tempmail', 'guerrilla', '10minute', 'throwaway', 'mailinator', 'yopmail', 'fakeinbox'];
  junk_patterns TEXT[] := ARRAY['test', 'asdf', 'qwer', '1234', 'xxx', 'aaa', 'zzz', 'abc', 'hjk', 'jkl', 'fgh', 'testing'];
  word TEXT;
  pattern TEXT;
  has_junk BOOLEAN := FALSE;
  is_same_char BOOLEAN := FALSE;
BEGIN
  sq := COALESCE(TRIM(p_special_qualities), '');
  fm := COALESCE(TRIM(p_favorite_memory), '');
  sq_len := LENGTH(sq);
  fm_len := LENGTH(fm);
  combined := LOWER(sq || ' ' || fm);
  
  -- Length scoring for special_qualities (0-25)
  IF sq_len >= 100 THEN score := score + 25;
  ELSIF sq_len >= 30 THEN score := score + 20;
  ELSIF sq_len >= 10 THEN score := score + 10;
  END IF;
  
  -- Length scoring for favorite_memory (0-25)
  IF fm_len >= 100 THEN score := score + 25;
  ELSIF fm_len >= 30 THEN score := score + 20;
  ELSIF fm_len >= 10 THEN score := score + 10;
  END IF;
  
  -- Check for junk patterns
  FOREACH pattern IN ARRAY junk_patterns LOOP
    IF LOWER(sq) ~ ('^' || pattern) OR LOWER(fm) ~ ('^' || pattern) THEN
      has_junk := TRUE;
      EXIT;
    END IF;
  END LOOP;
  
  -- Check if all same character
  IF sq_len > 0 AND sq ~ '^(.)\1+$' THEN
    is_same_char := TRUE;
  END IF;
  IF fm_len > 0 AND fm ~ '^(.)\1+$' THEN
    is_same_char := TRUE;
  END IF;
  
  -- Apply junk penalty only for short inputs
  IF (has_junk OR is_same_char) AND LENGTH(combined) < 30 THEN
    score := GREATEST(0, score - 30);
  END IF;
  
  -- Meaningful words bonus (up to 15 points)
  FOREACH word IN ARRAY meaningful_words LOOP
    IF combined LIKE '%' || word || '%' THEN
      score := score + 5;
      IF score >= 65 THEN EXIT; END IF; -- Cap the bonus contribution
    END IF;
  END LOOP;
  score := LEAST(score, 65); -- Ensure we don't exceed base + 15 meaningful
  
  -- Email quality check (not disposable) (+10)
  email_domain := LOWER(SPLIT_PART(p_email, '@', 2));
  IF email_domain IS NOT NULL AND email_domain != '' THEN
    DECLARE
      is_disposable BOOLEAN := FALSE;
    BEGIN
      FOREACH pattern IN ARRAY disposable_domains LOOP
        IF email_domain LIKE '%' || pattern || '%' THEN
          is_disposable := TRUE;
          EXIT;
        END IF;
      END LOOP;
      IF NOT is_disposable THEN
        score := score + 10;
      END IF;
    END;
  END IF;
  
  -- Phone bonus (+5)
  IF p_phone IS NOT NULL AND LENGTH(TRIM(p_phone)) >= 10 THEN
    score := score + 5;
  END IF;
  
  RETURN LEAST(100, GREATEST(0, score));
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- Backfill quality scores for existing leads
UPDATE public.leads
SET quality_score = public.calculate_lead_quality_score(
  special_qualities,
  favorite_memory,
  email,
  phone
)
WHERE quality_score IS NULL;