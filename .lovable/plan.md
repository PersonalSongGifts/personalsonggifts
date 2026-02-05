

# Fix Reaction Video & Improve Upload Function

## Summary

Fix the existing test video by updating the database record for order `046b88ff-7409-4518-a951-27dd7aad085f`, then improve the upload-reaction edge function to verify database updates succeed before returning success.

---

## Part 1: Fix Existing Test Video

Run a database update to link the orphaned video file to its order:

```sql
UPDATE orders 
SET 
  reaction_video_url = 'https://kjyhxodusvodkknmgmra.supabase.co/storage/v1/object/public/reactions/046b88ff-7409-4518-a951-27dd7aad085f-reaction.mp4',
  reaction_submitted_at = '2025-01-30T00:00:00Z'
WHERE id = '046b88ff-7409-4518-a951-27dd7aad085f';
```

---

## Part 2: Improve Edge Function

### Current Issues

1. **No verification after update** - Function returns success without confirming the database update worked
2. **Silent failures** - If RLS or permissions block the update, user sees success but data isn't saved
3. **Orphaned files** - Upload succeeds but database can fail, leaving files without records

### Improvements

| Change | Before | After |
|--------|--------|-------|
| Update verification | No check | Verify rows affected > 0 |
| Error detail | Generic message | Include actual error context in logs |
| Rollback on failure | None | Delete uploaded file if DB update fails |
| Logging | Basic | Detailed structured logging |

### Updated Code Flow

```text
1. Validate input & security checks
2. Verify order ownership
3. Upload video to storage
4. Update order record
5. ✅ VERIFY update succeeded (check data returned)
6. ❌ If update failed → Delete uploaded file → Return error
7. Return success with URL
```

---

## File Changes

| File | Changes |
|------|---------|
| Database | INSERT statement to fix existing order |
| `supabase/functions/upload-reaction/index.ts` | Add update verification, rollback logic, improved logging |

---

## Technical Details

### Verification Logic

```typescript
// Update order with reaction info - use .select() to verify
const { data: updatedOrder, error: updateError } = await supabase
  .from("orders")
  .update({
    reaction_video_url: publicUrl,
    reaction_submitted_at: new Date().toISOString(),
  })
  .eq("id", orderId)
  .select("id, reaction_video_url")
  .single();

// Verify the update actually happened
if (updateError || !updatedOrder || !updatedOrder.reaction_video_url) {
  console.error("Database update failed:", { 
    orderId, 
    updateError, 
    updatedOrder 
  });
  
  // Rollback: Delete the uploaded file since DB update failed
  await supabase.storage.from("reactions").remove([fileName]);
  console.log(`Rolled back uploaded file: ${fileName}`);
  
  return new Response(
    JSON.stringify({ error: "Failed to save reaction - please try again" }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

### Structured Logging

```typescript
console.log(JSON.stringify({
  event: "reaction_uploaded",
  orderId,
  fileName,
  videoUrl: publicUrl,
  fileSize: video.size,
  timestamp: new Date().toISOString(),
}));
```

---

## Expected Outcome

- ✅ Existing test video linked to order and visible in admin
- ✅ Future uploads verified before returning success
- ✅ Failed database updates trigger file cleanup
- ✅ Better error messages and logging for debugging

