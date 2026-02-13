CREATE OR REPLACE FUNCTION public.find_orders_by_short_id(
  short_id text,
  select_fields text DEFAULT '*',
  status_filter text[] DEFAULT ARRAY['delivered','ready'],
  require_song_url boolean DEFAULT true,
  max_results integer DEFAULT 2
)
RETURNS SETOF orders
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT *
  FROM orders
  WHERE id::text ILIKE short_id || '%'
    AND (status = ANY(status_filter) OR status_filter IS NULL)
    AND (song_url IS NOT NULL OR NOT require_song_url)
  LIMIT max_results;
$$;