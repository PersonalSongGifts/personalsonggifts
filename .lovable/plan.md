

# Fix: Country Style Prompts Missing Vocal Gender

## Problem

The Country Female and Country Male styles in the `song_styles` table have **identical** `suno_prompt` values. Neither mentions vocal gender, so Suno picks a random voice -- which is why the customer's "female" preference was ignored.

All other genres (Acoustic, EDM, Hip-Hop, Indie Folk, Jazz, K-Pop, Latin Pop, Pop, R&B, Rock) correctly include "female vocal" or "male vocal" in their prompts. Country is the only one missing it.

## Fix

Update both Country style prompts to include explicit vocal gender, matching the pattern used by all other genres:

**Country Female** (`dbc8e957-4a15-47ec-bd9c-965c037f52d1`):
> country rock, mid-tempo (90-110 BPM), warm and heartfelt vibe, acoustic guitar, clean electric guitar, steady drums and bass, touch of fiddle or pedal steel, front-porch storytelling feel, **warm expressive female vocal**, down-to-earth lyrics about love, family, and small moments, big sing-along chorus that feels like driving with the windows down, natural live-band production, cozy nostalgic energy with a hopeful uplifting tone

**Country Male** (`cfba483f-88f6-4b95-a34b-881e1b050da2`):
> country rock, mid-tempo (90-110 BPM), warm and heartfelt vibe, acoustic guitar, clean electric guitar, steady drums and bass, touch of fiddle or pedal steel, front-porch storytelling feel, **warm expressive male vocal**, down-to-earth lyrics about love, family, and small moments, big sing-along chorus that feels like driving with the windows down, natural live-band production, cozy nostalgic energy with a hopeful uplifting tone

## Technical Details

Two SQL UPDATE statements against the `song_styles` table, targeting the two Country rows by their UUIDs. No code changes needed -- the automation pipeline already reads the `suno_prompt` field dynamically.

## Impact

- All future Country songs will respect the customer's singer preference
- No code deploys required -- this is a data-only fix
- Existing songs are unaffected (they've already been generated)

