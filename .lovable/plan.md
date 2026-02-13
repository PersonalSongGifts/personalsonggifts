

## Fix: Valentine Remarketing Panel Visibility + Add Test Email Feature

### Problem Diagnosis

The `ValentineRemarketingPanel` component IS in the code (line 1491 of Admin.tsx), rendering above `EmailTemplates` in the Emails tab. Two possible causes for not seeing it:

1. The `fetchSettings` call fails silently, leaving the component stuck showing a tiny spinner card that is easy to miss above the large Email Templates section
2. If the fetch errors out, the component still renders but in a "loading" state (a small card with just a spinning icon)

### Changes

**1. Make the panel more visible and resilient (ValentineRemarketingPanel.tsx)**
- Add error state handling so a failed settings fetch shows a visible error card instead of an invisible spinner
- Add a "Send Test Emails" section with a comma-separated email input field and a send button that calls the edge function with `{ testEmails: [...] }`
- Default test emails to the 6 known addresses for convenience

**2. No other files need changes** — the import and rendering in Admin.tsx are already correct.

### Technical Details

**Test email feature implementation:**
- New state: `testEmailsInput` (string, comma-separated)
- New handler: `handleTestSend` that calls `callRemarketingFunction({ testEmails: emails.split(",").map(e => e.trim()) })`
- UI: Input field + "Send Test" button placed between the controls section and batch size section
- The `send-valentine-remarketing` edge function already supports `testEmails` mode — no backend changes needed

**Error resilience:**
- Wrap `fetchSettings` error path to set a visible `fetchError` state
- Show a yellow warning card with "Failed to load settings — Retry" button instead of silently failing
- Remove the loading spinner return and instead show the full panel with a "loading" indicator inline so the card title is always visible
