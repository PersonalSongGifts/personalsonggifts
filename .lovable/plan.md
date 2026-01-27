
# Fix Google Sheets Integration

## The Problem
The `GOOGLE_PRIVATE_KEY` secret contains the full Google credentials JSON file, but the code expects only the `private_key` value (the PEM string).

## Solution Options

### Option A: Update the Secret (Simpler)
You would re-save the `GOOGLE_PRIVATE_KEY` secret with **only** the private key portion:
1. Open your Google credentials JSON file
2. Find the `private_key` field
3. Copy just that value (starts with `-----BEGIN PRIVATE KEY-----` and ends with `-----END PRIVATE KEY-----\n`)
4. Update the secret with this value

### Option B: Update the Code (What I Recommend)
Modify the `append-to-sheet` edge function to handle both formats - if it detects a JSON object, it will extract the `private_key` field automatically. This is more robust and won't require changing the secret.

---

## Implementation (Option B)

### File: supabase/functions/append-to-sheet/index.ts

Add logic at the start of the function to parse the private key from JSON if needed:

```text
Before getting the private key:
  const privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY");

After (smarter parsing):
  let privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY") || "";
  
  // Handle case where full JSON was pasted instead of just the key
  if (privateKey.startsWith("{")) {
    try {
      const credentials = JSON.parse(privateKey);
      privateKey = credentials.private_key || "";
    } catch {
      // Not valid JSON, use as-is
    }
  }
```

This change means:
- If you paste just the private key → works
- If you paste the full JSON → works (extracts the key automatically)

---

## Technical Details

**Changes to `supabase/functions/append-to-sheet/index.ts`:**
1. After getting `GOOGLE_PRIVATE_KEY` from environment, check if it starts with `{`
2. If so, parse it as JSON and extract the `private_key` field
3. Continue with the existing logic

**Testing:**
After deployment, I'll call the function directly to verify it works with your existing secret.

---

## Summary
- One file to update: `supabase/functions/append-to-sheet/index.ts`
- Add ~10 lines of JSON parsing logic
- No need to change your existing secret
- Future-proof for either format
