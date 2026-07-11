CREATE INDEX IF NOT EXISTS idx_orders_id_text_pattern
  ON public.orders ((id::text) text_pattern_ops);

CREATE OR REPLACE FUNCTION public.find_orders_by_short_id(
  short_id text,
  select_fields text DEFAULT '*'::text,
  status_filter text[] DEFAULT ARRAY['delivered'::text, 'ready'::text],
  require_song_url boolean DEFAULT true,
  max_results integer DEFAULT 2
)
RETURNS SETOF orders
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT *
  FROM orders
  WHERE id::text LIKE lower(short_id) || '%'
    AND (status = ANY(status_filter) OR status_filter IS NULL)
    AND (song_url IS NOT NULL OR NOT require_song_url)
  LIMIT max_results;
$function$;