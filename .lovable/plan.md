

# Allow Admin Team Emails to Always Create Fresh Leads

## Problem

When you or your team submit test leads, the system checks if that email already has a lead:
- If the lead exists with `status = "converted"`, it silently skips (no new lead created)
- If the lead exists with another status, it updates the existing lead (no new row)

This makes it impossible for admins to repeatedly test the full lead flow.

## Solution

Create an "admin tester" allowlist. When an email is on this list, the system will:
1. Delete the existing lead (if any) before inserting a fresh one
2. Allow the new lead to flow through the full pipeline (new row, automation triggers, etc.)

### Admin Tester Emails (Stored in `admin_settings`)
- `ryan@hyperdrivelab.com`
- `sara@hyperdrivelab.com`
- `golanmaya2@gmail.com`

---

## Technical Changes

### 1. Add Admin Tester Setting to Database

Store the allowlist in `admin_settings` table:

```sql
INSERT INTO admin_settings (key, value)
VALUES ('admin_tester_emails', 'ryan@hyperdrivelab.com,sara@hyperdrivelab.com,golanmaya2@gmail.com')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### 2. Update `capture-lead/index.ts`

**Add logic before the duplicate check:**

```typescript
// Check if this is an admin tester email (can always create fresh leads)
const { data: testerSetting } = await supabase
  .from("admin_settings")
  .select("value")
  .eq("key", "admin_tester_emails")
  .maybeSingle();

const testerEmails = (testerSetting?.value || "")
  .split(",")
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

const isAdminTester = testerEmails.includes(normalizedEmail);

if (isAdminTester) {
  console.log(`[CAPTURE-LEAD] Admin tester email detected: ${normalizedEmail}, clearing existing lead`);
  
  // Delete any existing lead for this email (allows fresh start)
  await supabase
    .from("leads")
    .delete()
    .eq("email", normalizedEmail);
}

// Then proceed with normal insert (skip the duplicate check for testers)
```

**Modify the duplicate check to skip for testers:**

```typescript
// Check if lead already exists with this email (skip for admin testers)
if (!isAdminTester) {
  const { data: existingLead } = await supabase
    .from("leads")
    .select("id, status")
    .eq("email", normalizedEmail)
    .single();

  if (existingLead) {
    // ... existing update/skip logic
  }
}

// Always insert fresh for admin testers (existing one was deleted above)
```

### 3. Add Admin UI to Manage Tester Emails (Optional Enhancement)

In a future iteration, add a simple text field in the Automation Dashboard settings to edit the comma-separated list of admin tester emails.

---

## Behavior After Implementation

| Email | Existing Lead? | Result |
|-------|----------------|--------|
| `ryan@hyperdrivelab.com` | Yes (converted) | **Deleted** → New lead created → Appears in Leads table |
| `sara@hyperdrivelab.com` | Yes (any status) | **Deleted** → New lead created → Appears in Leads table |
| `golanmaya2@gmail.com` | No | New lead created (normal flow) |
| `realcustomer@gmail.com` | Yes (converted) | Skipped (existing behavior preserved) |
| `realcustomer@gmail.com` | No | New lead created (normal flow) |

---

## Files Changed

| File | Change |
|------|--------|
| Database (migration) | Add `admin_tester_emails` setting with initial values |
| `supabase/functions/capture-lead/index.ts` | Add tester detection + delete existing lead before insert |

---

## Testing Checklist

1. Go to the homepage and complete the lead form with `ryan@hyperdrivelab.com`
2. Check Admin → Leads tab - new lead should appear with fresh timestamp
3. Repeat the form submission - should see another new lead (old one deleted)
4. Confirm non-admin emails still follow the original duplicate prevention logic

