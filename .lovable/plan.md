

## Add Admin Override for Revision Request Fields

### What This Does

Adds an "Edit & Approve" flow to the Pending Revisions queue in the CS Assistant. Admins will be able to click into any revision request, modify the submitted values (e.g., fix a typo in a name, adjust genre, tweak special qualities), and then approve with those overrides applied instead of the raw customer submission.

### How It Works

Currently, clicking "Approve" takes the customer's submitted values verbatim and applies them to the order. This change adds an intermediate editing step.

### Changes

#### 1. Frontend: Add Edit Dialog (`src/components/admin/PendingRevisions.tsx`)

- Add a new "Edit & Approve" button alongside the existing "Approve" and "Reject" buttons
- Clicking it opens a Dialog pre-populated with all the revision's submitted values (only for fields the customer actually changed)
- Each changed field shows as an editable input/textarea with the original value displayed as reference
- A "Save & Approve" button submits the modified values to the backend
- The dialog uses the existing `EDITABLE_FIELDS` array for labels

UI layout inside the dialog:
```text
+------------------------------------------+
|  Edit Revision - [order short id]        |
+------------------------------------------+
|  Recipient Name                          |
|  Was: "John"                             |
|  [  Jonathan  ]  (editable input)        |
|                                          |
|  Special Qualities                       |
|  Was: "He loves fishing"                 |
|  [ He loves fishing and camping ]        |
|                                          |
|  [Cancel]              [Save & Approve]  |
+------------------------------------------+
```

#### 2. Backend: Accept admin modifications (`supabase/functions/admin-orders/index.ts`)

- In the `review_revision` handler, accept an optional `adminModifications` object in the request body
- When present, store it on the revision record's `admin_modifications` column for audit trail
- Override the revision's field values with admin modifications before applying to the order
- This means if the customer submitted `recipient_name: "Jon"` but the admin changes it to `"Jonathan"`, the order gets `"Jonathan"`

### Files Modified

| File | Change |
|------|--------|
| `src/components/admin/PendingRevisions.tsx` | Add edit dialog with editable fields, "Edit & Approve" button, and local state for modifications |
| `supabase/functions/admin-orders/index.ts` | Accept `adminModifications` in `review_revision`, store on revision record, apply overrides to order update |

### Technical Details

**Frontend state management:**
- `editingRevision`: tracks which revision is being edited (null when closed)
- `editedValues`: `Record<string, string>` initialized from the revision's changed fields
- Only fields in `fields_changed` are shown as editable
- Uses existing Input/Textarea components based on field type (short fields get Input, long text fields like special_qualities/favorite_memory/special_message get Textarea)

**Backend logic (in review_revision handler, ~line 2290):**
```
// After fetching the revision, before applying to order:
if (adminModifications && typeof adminModifications === 'object') {
  // Store for audit
  await supabase.from("revision_requests").update({ admin_modifications: adminModifications }).eq("id", revisionId);
  // Override rev values with admin edits
  for (const [key, val] of Object.entries(adminModifications)) {
    if (fieldMapping[key] !== undefined) {
      rev[key] = val;
    }
  }
}
```

The existing field-mapping and regeneration logic then processes the overridden values naturally -- no changes needed to the approval pipeline itself.

