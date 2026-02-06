

# Fix: Prevent Duets Across All Song Styles

## Problem

Suno is interpreting ambiguous phrases like "sing-along chorus," "group-style harmonies," and "call-and-response" as instructions to add a second singer -- producing duets when the customer specifically chose a solo male or female voice. This is happening most with Country but could affect any genre.

## Root Cause

Several prompts contain phrases that Suno reads as "add more voices":

| Genre | Risky Phrase | Duet Risk |
|-------|-------------|-----------|
| K-Pop (both) | "group-style harmonies and ad-libs" + "call-and-response moments" | HIGH |
| Country (both) | "big sing-along chorus" | HIGH |
| Rock (both) | "explosive sing-along chorus" | HIGH |
| Indie Folk (both) | "gentle sing-along chorus" | HIGH |
| Acoustic (both) | "gentle harmonies in the choruses" | MEDIUM |
| Pop (both) | "lush harmonies in the final chorus" | MEDIUM |
| R&B (both) | "stacked harmonies in the chorus" | MEDIUM |

Additionally, zero prompts currently include any explicit anti-duet instruction.

## Fix (Two-Part)

### Part 1: Add explicit solo-voice rule to every prompt

Append the following directive to all 22 active style prompts:

> solo [female/male] singer only, no duet, no featured artists, no secondary vocals

This is the strongest, most direct instruction Suno understands to prevent a second voice.

### Part 2: Rephrase ambiguous multi-voice phrases

Replace phrases that could trigger duets with solo-safe alternatives:

| Current Phrase | Replacement |
|---------------|-------------|
| "group-style harmonies and ad-libs" (K-Pop) | "layered self-harmonies and ad-libs" |
| "call-and-response moments" (K-Pop) | "catchy rhythmic hooks" |
| "sing-along chorus" (Country, Rock, Indie Folk) | "anthemic chorus" or "memorable chorus" |
| "gentle harmonies in the choruses" (Acoustic) | "gentle self-harmonies in the choruses" |
| "lush harmonies in the final chorus" (Pop) | "lush layered self-harmonies in the final chorus" |
| "stacked harmonies in the chorus" (R&B) | "stacked self-harmonies in the chorus" |

The word "self-harmonies" tells Suno to layer the same singer's voice rather than adding a different one.

## Technical Details

- 22 SQL UPDATE statements against the `song_styles` table (one per active style)
- Data-only fix -- no code changes or deploys needed
- The automation pipeline already reads `suno_prompt` dynamically, so changes take effect immediately for the next song generated

## Updated Prompts (All 22)

Each prompt below has two changes: (1) risky phrases replaced with solo-safe alternatives, and (2) explicit solo-singer directive appended at the end.

**Acoustic Female/Male**: Replace "gentle harmonies" with "gentle self-harmonies" and append solo directive.

**Country Female/Male**: Replace "big sing-along chorus" with "big anthemic chorus" and append solo directive.

**EDM Female/Male**: No risky phrases found -- just append solo directive.

**Hip-Hop Female/Male**: No risky phrases found -- just append solo directive.

**Indie Folk Female/Male**: Replace "gentle sing-along chorus" with "gentle memorable chorus" and append solo directive.

**Jazz Female/Male**: No risky phrases found -- just append solo directive.

**K-Pop Female/Male**: Replace "group-style harmonies" with "layered self-harmonies," replace "call-and-response moments" with "catchy rhythmic hooks," and append solo directive.

**Latin Pop Female/Male**: No risky phrases found -- just append solo directive.

**Pop Female/Male**: Replace "lush harmonies" with "lush layered self-harmonies" and append solo directive.

**R&B Female/Male**: Replace "stacked harmonies" with "stacked self-harmonies" and append solo directive.

**Rock Female/Male**: Replace "explosive sing-along chorus" with "explosive anthemic chorus" and append solo directive.

## Impact

- All future songs across every genre will be guaranteed solo performances
- The "self-harmonies" phrasing preserves the musical richness customers expect while keeping it to one singer's voice
- Existing songs are unaffected (already generated)
- No code deploys required

