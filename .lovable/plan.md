

## Fix: Parentheses vs Brackets in Generated Lyrics

### Problem
Suno treats `(text)` as **sung lyrics** and `[text]` as **non-sung production instructions**. The AI is generating stage directions like `(Smooth soulful keyboard fades in)` and `(Tempo slows, deep bass)` in parentheses, causing Suno to literally sing those instructions aloud.

### Fix
Add a rule to the `SYSTEM_PROMPT` in `supabase/functions/automation-generate-lyrics/index.ts` (around line 92-97, in the Formatting section):

```
# Formatting
- Use [Section Name] labels exactly
- CRITICAL: ALL production directions, instrumental cues, and performance instructions
  MUST use square brackets [], NEVER parentheses ().
  Parentheses () are SUNG by the AI vocalist. Square brackets [] are silent instructions.
  ✅ Correct: [Smooth soulful keyboard fades in]  [Tempo slows]  [Fade out with soft piano]
  ❌ Wrong:  (Smooth soulful keyboard fades in)  (Tempo slows)  (Fade out with soft piano)
- One line of lyrics per line
- Avoid overusing punctuation
- You may use repetitions for hooks and vocalizations (oh, ooooh, la la la)
```

### Scope
One file changed: `supabase/functions/automation-generate-lyrics/index.ts` — update to the system prompt only. No database changes, no frontend changes. Redeploy the edge function after.

### Note
This only affects **future** lyrics generations. Existing songs with this issue would need to be regenerated.

