

## Fix: Prevent Gemini from Inventing Details or Including Culturally Sensitive Content

### Problem

Two categories of issues:

1. **Hallucinated physical traits**: Gemini invents details like "blue eyes" or "golden hair" that were never mentioned by the customer. This feels wrong and breaks trust.
2. **Culturally insensitive content**: Gemini defaults to Western tropes (wine, champagne, toasting) that can be offensive -- e.g., referencing alcohol for a Muslim recipient.

### Root Cause

The system prompt in `supabase/functions/automation-generate-lyrics/index.ts` has a "Detail Fidelity" section that says to preserve details the customer provides, but it never says **"don't invent details the customer didn't provide."** Gemini fills gaps with generic imagery (blue eyes, wine glasses, beach sunsets) because it's trying to be vivid.

### The Fix

Add two new sections to the `SYSTEM_PROMPT` constant (lines 17-81):

**1. "No Fabrication" rule** (after the Detail Fidelity section):

```
# No Fabrication (CRITICAL)
- NEVER invent physical traits (eye color, hair color, height, skin tone, body type)
  unless the buyer explicitly described them in SpecialQualities or FavoriteMemory
- NEVER invent specific locations, cities, or place names unless the buyer mentioned them
- NEVER invent hobbies, jobs, or personality traits not referenced in the input
- If the input is vague, keep the lyrics emotionally specific but physically generic
- Use universal sensory details instead: "your smile," "your laugh," "the sound of your voice,"
  "the way you light up a room" -- NOT "your blue eyes" or "your golden hair"
- When in doubt, describe HOW someone makes people FEEL, not how they LOOK
```

**2. "Cultural Sensitivity" rule** (after No Fabrication):

```
# Cultural Sensitivity (CRITICAL)
- NEVER reference alcohol (wine, beer, champagne, cocktails, toasting, drinking)
  unless the buyer explicitly mentioned it in their input
- NEVER reference specific religious practices, dietary customs, or cultural rituals
  unless the buyer referenced them
- Avoid assumptions about lifestyle based on name, ethnicity, or region
- Safe universal alternatives for celebration: "raise a glass" -> "celebrate tonight";
  "champagne" -> "confetti"; "wine" -> "favorite song"; "bar" -> "dance floor"
- When the genre is Prayer/Worship, keep references non-denominational unless
  the buyer specified a faith tradition
```

### File Changed

| File | Change |
|------|--------|
| `supabase/functions/automation-generate-lyrics/index.ts` | Add two new sections to `SYSTEM_PROMPT` between "Detail Fidelity" and "Formatting" |

### Why This Works

- Gemini follows explicit negative constraints ("NEVER") very well -- it just needs to be told
- The "safe alternatives" list gives the model concrete substitutions instead of leaving it guessing
- The rule to describe feelings over appearances redirects the model's creativity productively
- No other files need to change -- this is purely a prompt update

### Deployment

The `automation-generate-lyrics` edge function will be redeployed after the change. Only affects newly generated lyrics -- existing songs are untouched.
