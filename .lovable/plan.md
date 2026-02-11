

## Strengthen Lyrics Detail Fidelity via Prompt Update

### What Changed
A customer received lyrics where "asked me to take your last name" (a proposal) was paraphrased into "asked for my name" (nonsensical). The AI was too aggressive in rewriting specific life events.

### Fix
Update the system prompt in the lyrics generation edge function to add explicit rules preventing the AI from paraphrasing key life moments. Also tighten the existing "clean up typos" rule so it doesn't encourage meaning changes.

### Changes

**Add a new "Detail Fidelity" section** to the system prompt with these rules:
- NEVER paraphrase proposals, marriages, births, deaths, or other life events into vaguer language
- When the input describes a specific action (e.g., "proposed," "asked me to marry"), preserve that exact meaning
- Prefer the customer's own phrasing over poetic alternatives when describing key moments
- If unsure about a detail's meaning, keep it closer to the original wording rather than interpreting loosely

**Tighten the existing cleanup rule** from:
> "If input has typos/fragments, infer meaning and clean up"

To:
> "If input has typos/fragments, infer meaning and clean up spelling/grammar, but NEVER change the meaning of what happened"

---

### Technical Details

#### File to Modify
- `supabase/functions/automation-generate-lyrics/index.ts` -- update the `SYSTEM_PROMPT` constant

#### Specific Prompt Changes

1. Add new section after "# Field Usage" block:

```
# Detail Fidelity (CRITICAL)
- Preserve the EXACT meaning of life events: proposals, weddings, births, deaths, diagnoses
- If input says someone "proposed" or "asked to marry," the lyrics MUST reflect a marriage proposal -- never paraphrase into something vaguer
- When input describes WHO did WHAT, maintain correct attribution (who proposed to whom, who said what)
- Prefer the customer's own phrasing for key moments over poetic alternatives
- Specific dates/years should be preserved when mentioned
- When in doubt, stay closer to the original wording
```

2. In the "# Rules" section, change:
```
- If input has typos/fragments, infer meaning and clean up
```
To:
```
- If input has typos/fragments, infer meaning and clean up spelling/grammar, but NEVER change the meaning of what happened
```

