
## Preserve Form State + Update Step 2 Title

### Form State Preservation (Already Works)

After reviewing the code, **form data is already fully preserved** when users navigate back through steps. Here's why:

- All form data lives in a single `formData` state object in the parent `CreateSong` component
- The "Back" button only changes the `currentStep` counter -- it never resets `formData`
- Each step component receives `formData` as a prop and displays whatever was previously entered
- This works identically on desktop, tablet, and mobile since it's pure React state (no device-specific behavior)

**One edge case:** If a user leaves the `/create` page entirely (navigates to homepage, closes tab, etc.) and comes back, they would start fresh. This is standard behavior and not part of the current request.

### Change Required

**File: `src/pages/CreateSong.tsx` (~line 67)**
- Change `stepTitles[1]` from `"Tell Us Their Name"` to `"Tell Us Who This Song Will Be For"`

That's the only code change needed -- one string update.
