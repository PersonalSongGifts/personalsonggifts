
## Fix Lyrics Generation - Switch to Lovable AI Gateway

### Root Cause
The lyrics generation is failing because the Kie.ai Gemini endpoint is returning a 200 response but with no `choices` array. The logs show:
```
[LYRICS] Gemini API response status: 200
[LYRICS] Gemini response received, choices: undefined
[LYRICS] No lyrics returned from Gemini
```

The current code uses Kie.ai's Gemini endpoint with a message format that may be incompatible. The API returns 200 but an empty/different response structure.

### Solution
Switch the lyrics generation from Kie.ai to the **Lovable AI Gateway**, which:
- Uses the standard OpenAI-compatible format
- Has `LOVABLE_API_KEY` already configured (auto-provisioned)
- Provides access to `google/gemini-3-flash-preview` (same model)
- Is the recommended approach for AI integrations

---

## Technical Changes

### File: `supabase/functions/automation-generate-lyrics/index.ts`

**Change 1: Switch API endpoint and auth key**

```text
Before:
const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
...
const geminiResponse = await fetch("https://api.kie.ai/gemini-3-flash/v1/chat/completions", {
  headers: {
    "Authorization": `Bearer ${KIE_API_KEY}`,
  },

After:
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
...
const geminiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
  headers: {
    "Authorization": `Bearer ${LOVABLE_API_KEY}`,
  },
```

**Change 2: Fix message format (use standard OpenAI format)**

```text
Before:
messages: [
  { role: "developer", content: SYSTEM_PROMPT },
  { role: "user", content: userPrompt },
],

After:
model: "google/gemini-3-flash-preview",
messages: [
  { role: "system", content: SYSTEM_PROMPT },
  { role: "user", content: userPrompt },
],
```

**Change 3: Add debug logging for response structure**

Add a log to see the full response structure when lyrics are missing:
```javascript
if (!lyrics) {
  console.error("[LYRICS] No lyrics returned. Response structure:", JSON.stringify(geminiData).substring(0, 500));
  ...
}
```

---

## Why This Fixes the Issue

| Aspect | Kie.ai (Current) | Lovable AI Gateway (New) |
|--------|------------------|-------------------------|
| Format | Uses `developer` role and nested content | Standard OpenAI format |
| Auth | `KIE_API_KEY` | `LOVABLE_API_KEY` (auto-provisioned) |
| Model | `gemini-3-flash` | `google/gemini-3-flash-preview` |
| Reliability | Different response structure | Standard `choices[0].message.content` |

---

## Deployment Steps

1. Update `automation-generate-lyrics/index.ts` with the new endpoint and format
2. Deploy the edge function
3. Test by triggering AI generation on an order

---

## Summary

Single file change in `automation-generate-lyrics/index.ts`:
- Switch from Kie.ai to Lovable AI Gateway
- Use `LOVABLE_API_KEY` instead of `KIE_API_KEY`
- Use standard OpenAI message format (`system` role, string content)
- Add model specification: `google/gemini-3-flash-preview`
