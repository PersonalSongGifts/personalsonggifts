

## Fix "View Form" Link + Ensure Customer Notes Reach Gemini

### Issue 1: "View Form" Link Broken

**Root cause:** The "View Form" button constructs the URL using `rev.order_id` (a UUID like `6096f0fd-...`), but the revision page expects a `revision_token` (a different value). The `get-revision-page` function looks up orders by `revision_token`, not by `id`, so the link always results in "not found."

**Fix (2 changes):**

1. **Backend** (`supabase/functions/admin-orders/index.ts`, ~line 2183): Add `revision_token` to the order select in `list_pending_revisions`:
   ```
   .select("id, recipient_name, customer_name, customer_email, occasion, status, revision_token")
   ```

2. **Frontend** (`src/components/admin/PendingRevisions.tsx`, ~line 315): Update the URL to use the revision token:
   ```typescript
   // Before:
   onClick={() => window.open(`/song/revision/${rev.order_id}`, "_blank")}
   // After:  
   onClick={() => {
     const token = (rev as any).order_revision_token;
     if (token) window.open(`/song/revision/${token}`, "_blank");
     else toast({ title: "No revision token", description: "This order doesn't have a revision token.", variant: "destructive" });
   }}
   ```

   Also add `order_revision_token` to the enrichment block (~line 2194) and the `RevisionRequest` interface.

---

### Issue 2: Customer Notes Being Ignored by Gemini

**Root cause:** In `automation-generate-lyrics/index.ts` line 300:
```typescript
const senderCtx = entity.sender_context || entity.notes || "";
```

This uses `||`, so if `sender_context` has any value (e.g., "I'm a man writing to my girlfriend"), the `notes` field (which contains the customer's `anything_else` input like "add travelling together...") is **completely skipped**.

**Fix:** Change the logic to concatenate both fields so Gemini sees everything:
```typescript
const senderCtx = [entity.sender_context, entity.notes].filter(Boolean).join("\n\n");
```

This ensures:
- If only `sender_context` exists, Gemini gets that
- If only `notes` exists, Gemini gets that  
- If both exist (like in this screenshot), Gemini gets both separated by a newline

---

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/admin-orders/index.ts` | Add `revision_token` to order select in `list_pending_revisions`; include it in enriched response |
| `src/components/admin/PendingRevisions.tsx` | Update "View Form" URL to use `order_revision_token`; add field to interface |
| `supabase/functions/automation-generate-lyrics/index.ts` | Change `||` to concatenation so both `sender_context` and `notes` reach Gemini |

### Impact

- CS team can click "View Form" and see the actual revision page the customer used
- All customer notes (style requests, story additions, etc.) will be included as context for Gemini during lyrics generation, alongside the sender context
