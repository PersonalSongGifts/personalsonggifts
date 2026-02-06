/**
 * Normalize a phone number to E.164 format.
 * - Strips non-digit characters (except leading +)
 * - Prepends +1 if exactly 10 digits (US default)
 * - Returns null if result doesn't match E.164 pattern
 * 
 * Invalid phone = silently skip SMS; never blocks checkout.
 */
export function normalizeToE164(phone: string | undefined | null): string | null {
  if (!phone || !phone.trim()) return null;

  // Strip everything except digits and leading +
  let cleaned = phone.trim();
  const hasPlus = cleaned.startsWith("+");
  cleaned = cleaned.replace(/[^\\d]/g, "");

  if (!cleaned) return null;

  // If it had a leading +, restore it
  if (hasPlus) {
    cleaned = "+" + cleaned;
  }
  // If exactly 10 digits (no +), assume US and prepend +1
  else if (cleaned.length === 10) {
    cleaned = "+1" + cleaned;
  }
  // If 11 digits starting with 1, prepend +
  else if (cleaned.length === 11 && cleaned.startsWith("1")) {
    cleaned = "+" + cleaned;
  }
  // Otherwise prepend + if not already there
  else if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }

  // Validate E.164: + followed by 10-15 digits
  if (/^\+\d{10,15}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
}

