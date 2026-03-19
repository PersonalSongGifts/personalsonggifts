

## Fix: Update Follow-up Label in Test Email Dropdown

### Problem
The dropdown in `TestEmailSender.tsx` line 22 still shows `"Lead Follow-up ($5 Off)"` — needs to say `"Lead Follow-up ($10 Off)"`.

### Change

**`src/components/admin/TestEmailSender.tsx`** — line 21-22:
- Change `label: "Lead Follow-up ($5 Off)"` to `label: "Lead Follow-up ($10 Off)"`

### About the test link
The test email uses a dummy preview token (`demo`), so the link won't load a real song page. This is by design — it confirms the email sends, the copy is correct, and the $10 off messaging appears. To test with a real lead's data and a working preview link, you'd use the manual "Send Follow-up" button on a specific lead in the Leads tab.

One file, one line change.

