

# Fix Edge Function Deployment Timeouts

## Problem Summary

Your edge functions are failing to deploy with "Bundle generation timed out" errors, causing the `admin-orders`, `capture-lead`, and `upload-reaction` functions to return 404. This breaks admin login, lead capture, and reaction uploads.

**Root causes identified:**
1. **Unstable CDN imports**: All 21 edge functions use `https://esm.sh/` imports which can cause unpredictable bundle resolution times
2. **Heavy dependencies at top level**: Functions import the full Stripe SDK even when not always needed
3. **No health check**: The admin UI can't distinguish between "backend down" vs "wrong password"

---

## Solution Overview

```text
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT FIX STRATEGY                     │
├─────────────────────────────────────────────────────────────────┤
│  Phase 1: Thin First                                            │
│  - Convert all esm.sh imports to stable npm: imports           │
│  - Keep admin-orders minimal (no Stripe)                       │
│                                                                 │
│  Phase 2: Health Endpoint                                       │
│  - Create /health function with build timestamp + env          │
│  - Update admin UI to show "backend unavailable" vs "wrong pw" │
│                                                                 │
│  Phase 3: Deploy + Verify                                       │
│  - Deploy functions one-by-one starting with admin-orders      │
│  - Confirm 200 responses in preview and production             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Convert All Imports to Stable npm: Specifiers

### Files to Update (21 functions)

Replace all `esm.sh` imports with stable `npm:` specifiers:

| Old Import | New Import |
|------------|------------|
| `https://esm.sh/@supabase/supabase-js@2` | `npm:@supabase/supabase-js@2.93.1` |
| `https://esm.sh/stripe@18.5.0` | `npm:stripe@18.5.0` |
| `https://esm.sh/mp3tag.js@3.11.0` | `npm:mp3tag.js@3.11.0` |

**Functions to update:**
- admin-orders/index.ts
- capture-lead/index.ts
- upload-reaction/index.ts
- create-checkout/index.ts
- create-lead-checkout/index.ts
- process-payment/index.ts
- process-lead-payment/index.ts
- stripe-webhook/index.ts
- automation-trigger/index.ts
- automation-generate-lyrics/index.ts
- automation-generate-audio/index.ts
- automation-suno-callback/index.ts
- automation-get-settings/index.ts
- process-scheduled-deliveries/index.ts
- send-lead-preview/index.ts
- send-lead-followup/index.ts
- get-song-page/index.ts
- get-lead-preview/index.ts
- track-song-engagement/index.ts
- upload-song/index.ts
- create-order/index.ts

---

## Phase 2: Create Health Endpoint

### New File: `supabase/functions/health/index.ts`

A lightweight endpoint that returns:
- `status`: "ok"
- `buildTimestamp`: ISO timestamp when function was deployed
- `env`: "preview" or "production" (based on project URL)
- `version`: Git commit hash or build identifier

```typescript
// Pseudocode structure
Deno.serve((req) => {
  return Response.json({
    status: "ok",
    buildTimestamp: "2026-02-05T12:00:00.000Z", // Set at deploy time
    env: Deno.env.get("SUPABASE_URL")?.includes("preview") ? "preview" : "production",
    version: "v1.0.0-hotfix-imports"
  });
});
```

### Update: `supabase/config.toml`

Add health function configuration:
```toml
[functions.health]
verify_jwt = false
```

---

## Phase 3: Update Admin Login UI

### File: `src/pages/Admin.tsx`

Improve the `handleLogin` function to:
1. First call `/health` to check backend availability
2. If health fails with 404 or network error → show "Backend unavailable" message
3. If health succeeds but admin-orders fails with 401 → show "Wrong password"
4. If admin-orders fails with 404 → show "Backend functions not deployed"

```typescript
// Pseudocode for improved login flow
const handleLogin = async (e) => {
  // Step 1: Check health endpoint
  const healthCheck = await fetch(`${SUPABASE_URL}/functions/v1/health`);
  
  if (!healthCheck.ok) {
    toast({ 
      title: "Backend Unavailable",
      description: "Functions are not deployed. Please wait and retry.",
      variant: "destructive" 
    });
    return;
  }
  
  // Step 2: Try actual login
  const { data, error } = await listOrders("all");
  
  if (error) {
    // Distinguish 401 (wrong password) vs 404 (not deployed)
    if (error.message?.includes("404") || error.message?.includes("not found")) {
      toast({ title: "Function Not Deployed", ... });
    } else {
      toast({ title: "Wrong Password", ... });
    }
  }
};
```

---

## Phase 4: Deploy Strategy

### Order of Operations

1. **Deploy `health` function first** - Smallest, no dependencies
2. **Deploy `admin-orders`** - Critical for admin access
3. **Verify admin login works**
4. **Deploy remaining functions in batches:**
   - Batch A: `capture-lead`, `upload-reaction`, `get-song-page`
   - Batch B: `automation-*` functions (4 functions)
   - Batch C: `send-*` and `create-*` functions
   - Batch D: Stripe-heavy functions (`stripe-webhook`, `create-checkout`, etc.)

5. **Final verification:** Confirm all key endpoints return 200 in both preview and production

---

## Technical Details

### Why npm: specifiers are more stable

- **No transpilation**: `npm:` imports use pre-built packages directly
- **Deterministic resolution**: No CDN redirect issues or stale caches
- **Faster bundling**: Deno can resolve dependencies locally without network calls

### Version Stamping Implementation

The health endpoint will include a hardcoded timestamp that gets updated each time we deploy. This allows you to verify which version of the code is actually running.

### Files Changed Summary

| File | Change |
|------|--------|
| 21 edge function files | Replace esm.sh with npm: imports |
| `supabase/functions/health/index.ts` | New file - health check endpoint |
| `supabase/config.toml` | Add health function config |
| `src/pages/Admin.tsx` | Improved login error handling |

---

## Expected Outcome

After implementation:
- Admin login works reliably
- Lead capture flow functions correctly
- Reaction upload works
- Health endpoint provides clear status for debugging
- Version stamping confirms which build is live
- No more "Bundle generation timed out" errors

