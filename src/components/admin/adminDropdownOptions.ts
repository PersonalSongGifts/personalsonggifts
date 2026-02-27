// Shared dropdown options for admin forms - matches customer-facing options

export const genreOptions = [
  { id: "pop", label: "Pop" },
  { id: "country", label: "Country" },
  { id: "prayer", label: "Prayer" },
  { id: "rock", label: "Rock" },
  { id: "rnb", label: "R&B" },
  { id: "jazz", label: "Jazz" },
  { id: "acoustic", label: "Acoustic" },
  { id: "rap-hip-hop", label: "Rap / Hip-Hop" },
  { id: "indie", label: "Indie" },
  { id: "latin", label: "Latin" },
  { id: "kpop", label: "K-Pop" },
  { id: "edm-dance", label: "EDM / Dance" },
];

export const singerOptions = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
];

export const occasionOptions = [
  { id: "valentines", label: "Valentine's Day" },
  { id: "wedding", label: "Wedding" },
  { id: "anniversary", label: "Anniversary" },
  { id: "baby", label: "Baby Lullaby" },
  { id: "memorial", label: "Memorial Tribute" },
  { id: "pet-celebration", label: "Pet Celebration" },
  { id: "pet-memorial", label: "Pet Memorial" },
  { id: "milestone", label: "Milestone" },
  { id: "birthday", label: "Birthday" },
  { id: "graduation", label: "Graduation" },
  { id: "retirement", label: "Retirement" },
  { id: "mothers-day", label: "Mother's Day" },
  { id: "fathers-day", label: "Father's Day" },
  { id: "proposal", label: "Proposal" },
  { id: "friendship", label: "Friendship" },
  { id: "thank-you", label: "Thank You" },
  { id: "just-because", label: "Just Because" },
  { id: "custom", label: "Custom" },
];

export const languageOptions = [
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
  { id: "it", label: "Italian" },
  { id: "pt-BR", label: "Portuguese (Brazil)" },
  { id: "ja", label: "Japanese" },
  { id: "ko", label: "Korean" },
  { id: "sr", label: "Serbian" },
  { id: "hr", label: "Croatian" },
  { id: "hi", label: "Hindi" },
];

// Helper to get label from ID
export function getLabelForOption(
  options: { id: string; label: string }[],
  id: string | undefined | null
): string {
  if (!id) return "";
  const found = options.find((opt) => opt.id.toLowerCase() === id.toLowerCase());
  return found?.label || id;
}

export function getLanguageLabel(code: string): string {
  return getLabelForOption(languageOptions, code);
}
