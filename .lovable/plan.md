

## Admin Lyrics Editing

This feature adds the ability for admins to directly edit lyrics for both orders and leads from the admin panel. Edited lyrics will immediately reflect on customer-facing song pages.

### What Changes

**1. Backend: Allow `automation_lyrics` in the update whitelist**

- In `supabase/functions/admin-orders/index.ts`, add `"automation_lyrics"` to the `allowedFields` array for both the `update_order_fields` action (line 729) and the `update_lead_fields` action (line 852).
- When `automation_lyrics` is updated, also set `automation_manual_override_at` to the current timestamp. This prevents future AI callbacks from overwriting manual admin edits.

**2. Order Detail Dialog: Add editable lyrics textarea**

In `src/pages/Admin.tsx` (around line 1853), replace the read-only lyrics `<pre>` block with:
- In **view mode**: Show lyrics as before (read-only `<pre>` with Copy button), but add an "Edit" button next to the Copy button.
- In **edit mode**: Show a `<Textarea>` pre-filled with the current lyrics, with Save and Cancel buttons.
- Allow admins to add lyrics even when none exist (for the "lyrics paid but missing" warning case).

**3. Lead Detail Dialog: Add editable lyrics textarea**

In `src/components/admin/LeadsTable.tsx` (around line 1694), apply the same pattern:
- View mode with an Edit button.
- Edit mode with a Textarea, Save, and Cancel buttons.

### Technical Details

- Lyrics editing uses a separate state variable (`editingLyrics` / `editedLyricsText`) independent of the existing order field editing, so admins can quickly edit lyrics without entering full edit mode.
- The save action calls the existing `update_order_fields` / `update_lead_fields` endpoints with `{ automation_lyrics: newText }`.
- Setting `automation_manual_override_at` on the backend ensures the automation pipeline won't overwrite the admin's manual edit.
- Max length validation of 5000 characters on the textarea to prevent abuse.
- The `get-song-page` edge function already serves `automation_lyrics` to customers -- no changes needed there.

