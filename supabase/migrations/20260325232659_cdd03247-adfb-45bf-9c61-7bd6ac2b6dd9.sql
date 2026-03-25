ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS lyrics_word_count integer;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lyrics_word_count integer;