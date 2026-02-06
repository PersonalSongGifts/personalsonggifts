import { z } from "zod";

// Validation schemas for each step
export const step1Schema = z.object({
  recipientType: z.string().min(1, "Please select who this song is for"),
});

export const step2Schema = z.object({
  recipientName: z.string().trim().min(1, "Please enter their name").max(100, "Name must be less than 100 characters"),
});

export const step3Schema = z.object({
  occasion: z.string().min(1, "Please select an occasion"),
});

export const step4Schema = z.object({
  genre: z.string().min(1, "Please select a music genre"),
  singerPreference: z.string().min(1, "Please select a singer preference"),
  lyricsLanguageCode: z.string().optional(), // Optional - defaults to "en"
});

export const step5Schema = z.object({
  specialQualities: z.string().trim().min(1, "Please tell us what makes them special").max(250, "Must be less than 250 characters"),
  favoriteMemory: z.string().trim().min(1, "Please share a favorite memory").max(250, "Must be less than 250 characters"),
});

export const step6Schema = z.object({
  specialMessage: z.string().max(250, "Must be less than 250 characters").optional(),
});

export const step7Schema = z.object({
  yourName: z.string().trim().min(1, "Please enter your name").max(100, "Name must be less than 100 characters"),
  yourEmail: z.string().trim().email("Please enter a valid email address").max(255, "Email must be less than 255 characters"),
});

// Get validation schema for a specific step
export const getStepSchema = (step: number) => {
  switch (step) {
    case 1: return step1Schema;
    case 2: return step2Schema;
    case 3: return step3Schema;
    case 4: return step4Schema;
    case 5: return step5Schema;
    case 6: return step6Schema;
    case 7: return step7Schema;
    default: return z.object({});
  }
};

// Validate a step and return errors
export const validateStep = (step: number, data: object): Record<string, string> => {
  const schema = getStepSchema(step);
  const result = schema.safeParse(data);
  
  if (result.success) {
    return {};
  }
  
  const errors: Record<string, string> = {};
  result.error.errors.forEach((err) => {
    const field = err.path[0] as string;
    if (!errors[field]) {
      errors[field] = err.message;
    }
  });
  
  return errors;
};
