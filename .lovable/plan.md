
## What’s actually happening (root cause)

Your `regenerate_song` request **never reaches** the `if (body?.action === "regenerate_song") { ... }` handler.

In `supabase/functions/admin-orders/index.ts`, there’s a **legacy “update order” fallback block** that runs for *any* POST request that includes an `orderId` **even when `action` is present**. That block is located **before** the `regenerate_song` handler and ends with:

- `.update(updateData)` where `updateData` is often `{}` for regenerate requests
- `.select().single()` which throws **PGRST116** when 0 rows come back

This exactly matches what we see in the backend logs:
- We see `[ADMIN] POST {"action":"regenerate_song"...}`
- We **do not** see any of the `[REGENERATE] ...` logs (meaning the regenerate handler never ran)
- We immediately see `Admin orders error: PGRST116 ...`

So this is a **routing/handler ordering bug**, not a missing order row, not scheduling, not Suno, not credits.

---

## Goals of the fix

1. Ensure `action:"regenerate_song"` requests always hit the regenerate handler.
2. Ensure the legacy “update order” fallback only runs when **no `action` is provided** (backward compatibility for existing calls like `updateOrder()` in `Admin.tsx`).
3. Eliminate accidental `.single()` failures in the fallback path (and return clearer errors).
4. Add the precise debug logging + “debug echo” style responses you requested for fast isolation (env + table + id).

---

## Implementation plan (code changes)

### 1) Gate the legacy update-order fallback so it only runs when `action` is missing
**File:** `supabase/functions/admin-orders/index.ts`

- Near the top of the POST handler, compute:
  - `const action = typeof body?.action === "string" ? body.action : null;`
- Wrap the legacy block that starts around:
  ```ts
  const { orderId, status, songUrl, song_title, deliver, scheduleDelivery, scheduledDeliveryAt } = ...
  ```
  so it runs only when:
  ```ts
  if (!action) { ... legacy update behavior ... }
  ```
- If `action` exists but doesn’t match any known handler, return a clean:
  - `400 { error: "Unknown action", action }`
  instead of falling into legacy update logic.

**Why:** This is the direct cause of regenerate being intercepted and triggering `.single()`.

---

### 2) Make the legacy fallback safer (stop `.single()` from throwing unhelpful 500s)
**File:** `supabase/functions/admin-orders/index.ts`

Inside the `if (!action) { ... }` legacy block:

- Add a guard:
  - If no meaningful updates are provided (`updateData` is empty AND not delivering AND not scheduling), return:
    - `400 { error: "No update fields provided" }`
- Replace the legacy `.single()` with `.maybeSingle()` and handle not found:
  - If result is null → `404 { error: "Order not found", orderId }`

This prevents the same PGRST116 class of error from happening again in other edge cases.

---

### 3) Improve regenerate debug logging exactly as requested
**File:** `supabase/functions/admin-orders/index.ts` in the `regenerate_song` handler (already exists)

Add/ensure logs at the very top of the regenerate handler *before DB calls*:

- `action`
- `orderId` / `leadId` exactly received
- `entityType` chosen
- explicit query intent like: `table=orders where id=<...>`

Even though we already log `[ADMIN] POST {action, orderId, leadId}`, we’ll also log inside the handler so we can prove it is reached.

---

### 4) Add “env” to 404/debug echo without leaking backend identifiers
**File:** `supabase/functions/admin-orders/index.ts`

- Derive a safe environment label from request headers:
  - Use `Origin` or `Referer` and classify:
    - `"preview"` if it includes `id-preview--`
    - otherwise `"published"` (or `"unknown"`)
- Include `env` in:
  - the “not found” response
  - the “must provide exactly one of orderId/leadId” response
  - any debug echo response

Example response shape:
```json
{
  "error": "Order not found",
  "env": "preview",
  "entityType": "orders",
  "entityId": "..."
}
```

This satisfies the “env mismatch” debugging requirement while respecting the rule to not expose internal project refs/URLs.

---

## How we’ll verify (fast checks)

### A) Confirm the regenerate handler is now reached
1. In Preview Admin UI, click **Regenerate Song → Send now**
2. Backend logs should show lines like:
   - `[REGENERATE] Received request ...`
3. UI should show:
   - “Regeneration Started” (200)  
   OR a clean 4xx with JSON details (not a 500)

### B) Confirm legacy updates still work
- Use an action that previously relied on the legacy path (no `action` field), e.g.:
  - updating order status/song_url/deliver/schedule delivery
- Ensure those still succeed.

### C) Confirm the automation pipeline starts
- After regeneration success:
  - Order should have updated `earliest_generate_at` / `target_send_at`
  - Automation should pick it up shortly (or trigger immediately if `automation-trigger` succeeds)

---

## Files involved
- `supabase/functions/admin-orders/index.ts` (primary fix: routing + legacy gating + logging)
- `src/pages/Admin.tsx` (likely no change needed for this specific fix, since it already sends `action:"regenerate_song"` correctly; we’ll only adjust if we want to surface extra debug fields in the toast later)

---

## Expected outcome after fix
Clicking **Regenerate Song** in Preview will no longer hit the legacy update block, so:
- No more `500 — PGRST116` from `.single()` interception
- You’ll either get a success toast or a clean, actionable 4xx/404 message with `env/entityType/entityId` for debugging.
