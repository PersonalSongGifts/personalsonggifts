
# Fix: Admin Dashboard Access - CORS Header Issue

## Problem Identified
The admin dashboard cannot access the `admin-orders` edge function because the custom `x-admin-password` header is **not included in the CORS allowed headers**.

When your browser sends a request with a custom header like `x-admin-password`, it first sends a "preflight" OPTIONS request to check if that header is allowed. The edge function responds saying only these headers are permitted:
- `authorization`
- `x-client-info`
- `apikey`
- `content-type`

Since `x-admin-password` isn't in that list, the browser blocks the request entirely.

## Solution
Add `x-admin-password` to the CORS allowed headers in the edge function.

## Changes Required

**File:** `supabase/functions/admin-orders/index.ts`

Update line 5 from:
```typescript
"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
```

To:
```typescript
"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
```

## Result
After this one-line fix, the admin dashboard will be able to authenticate and access orders properly.

## Verification Steps
1. Navigate to `/admin` on the published site
2. Enter the admin password
3. Confirm orders load successfully
