// Shared all-in order total (base + package + bonus + download + lyrics + rush,
// excluding tips) so every analytics module reports the same AOV/revenue.
export interface TotalableOrder {
  price?: number | null;
  price_cents?: number | null;
  lyrics_price_cents?: number | null;
  download_price_cents?: number | null;
  bonus_price_cents?: number | null;
  package_price_cents?: number | null;
  rush_price_cents?: number | null;
}

export function orderTotalDollars(o: TotalableOrder): number {
  const upsellCents =
    (o.lyrics_price_cents ?? 0) +
    (o.download_price_cents ?? 0) +
    (o.bonus_price_cents ?? 0) +
    (o.package_price_cents ?? 0) +
    (o.rush_price_cents ?? 0);
  const baseDollars = o.price_cents != null ? o.price_cents / 100 : (o.price || 0);
  return baseDollars + upsellCents / 100;
}
