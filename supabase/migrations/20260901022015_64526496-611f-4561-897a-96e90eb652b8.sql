-- P0 cover-art security gate: per-order generation cap.
-- Each generate-album-cover call must atomically claim an attempt; when the
-- cap is reached the claim fails and no Kie job is ever submitted.

alter table public.orders
  add column if not exists album_cover_attempts integer not null default 0;

create or replace function public.claim_album_cover_attempt(p_order_id uuid, p_max integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new integer;
begin
  update public.orders
     set album_cover_attempts = coalesce(album_cover_attempts, 0) + 1
   where id = p_order_id
     and coalesce(album_cover_attempts, 0) < p_max
  returning album_cover_attempts into v_new;

  if v_new is null then
    return -1;
  end if;

  return v_new;
end;
$$;

revoke all on function public.claim_album_cover_attempt(uuid, integer) from public, anon, authenticated;