

## Implement "Edit & Approve" for Revision Requests

The backend already accepts `adminModifications` (implemented in the previous session). This plan covers the remaining frontend work.

### Changes

#### 1. New file: `src/components/admin/RevisionEditDialog.tsx`

A dialog component that:
- Takes a revision and displays editable fields for each changed field
- Shows "Was: ..." reference text above each input
- Uses Input for short fields, Textarea for long text fields (special_qualities, favorite_memory, etc.)
- Has "Cancel" and "Save & Approve" buttons
- Only sends fields the admin actually modified (compares against customer's original submission)

#### 2. Update: `src/components/admin/PendingRevisions.tsx`

- Import and render `RevisionEditDialog`
- Add state: `editingRevision` (which revision is being edited)
- Add an "Edit & Approve" button (with pencil icon) in the action buttons row alongside Approve/Reject
- Update `handleAction` to accept optional `adminModifications` parameter and pass it to the backend
- When "Save & Approve" is clicked in the dialog, call `handleAction` with the modifications

### Files Modified

| File | Change |
|------|--------|
| `src/components/admin/RevisionEditDialog.tsx` | New component with edit dialog UI |
| `src/components/admin/PendingRevisions.tsx` | Add Edit & Approve button, wire up dialog, pass modifications to backend |

No backend changes needed -- the `adminModifications` handling is already deployed.

