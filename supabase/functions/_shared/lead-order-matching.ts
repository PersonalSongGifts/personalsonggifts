export type LeadLike = {
  email?: string | null;
  recipient_name?: string | null;
  recipient_type?: string | null;
  occasion?: string | null;
  genre?: string | null;
  singer_preference?: string | null;
  special_qualities?: string | null;
  favorite_memory?: string | null;
  special_message?: string | null;
  lyrics_language_code?: string | null;
};

export type OrderLike = {
  customer_email?: string | null;
  recipient_name?: string | null;
  recipient_type?: string | null;
  occasion?: string | null;
  genre?: string | null;
  singer_preference?: string | null;
  special_qualities?: string | null;
  favorite_memory?: string | null;
  special_message?: string | null;
  lyrics_language_code?: string | null;
};

function normalizeText(value?: string | null): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function buildLeadFingerprint(entry: LeadLike | OrderLike): string {
  return [
    normalizeText(entry.recipient_name),
    normalizeText(entry.recipient_type),
    normalizeText(entry.occasion),
    normalizeText(entry.genre),
    normalizeText(entry.singer_preference),
    normalizeText(entry.special_qualities),
    normalizeText(entry.favorite_memory),
    normalizeText(entry.special_message),
    normalizeText(entry.lyrics_language_code ?? 'en'),
  ].join('|');
}

export function emailsMatch(leadEmail?: string | null, orderEmail?: string | null): boolean {
  return normalizeText(leadEmail) !== '' && normalizeText(leadEmail) === normalizeText(orderEmail);
}

export function leadMatchesOrder(lead: LeadLike, order: OrderLike): boolean {
  return emailsMatch(lead.email, order.customer_email) && buildLeadFingerprint(lead) === buildLeadFingerprint(order);
}

export function buildLeadFingerprintFromInput(input: {
  recipientName: string;
  recipientType: string;
  occasion: string;
  genre: string;
  singerPreference: string;
  specialQualities: string;
  favoriteMemory: string;
  specialMessage?: string | null;
  lyricsLanguageCode?: string | null;
}): string {
  return buildLeadFingerprint({
    recipient_name: input.recipientName,
    recipient_type: input.recipientType,
    occasion: input.occasion,
    genre: input.genre,
    singer_preference: input.singerPreference,
    special_qualities: input.specialQualities,
    favorite_memory: input.favoriteMemory,
    special_message: input.specialMessage,
    lyrics_language_code: input.lyricsLanguageCode ?? 'en',
  });
}
