

## Add Explicit Video Usage Consent to Reaction Submission Page

Currently, the consent language on `/submit-reaction` is a passive, vague line of text: *"By submitting this video, you give permission to Personal Song Gifts to use this video."* This does not hold up for advertising, social media, or marketing use.

### What changes

**File: `src/pages/SubmitReaction.tsx`**

1. **Replace the passive text disclaimer** (line 199) with a **required checkbox** that the user must check before the Submit button becomes enabled.

2. **Consent checkbox text:**
   > "I grant Personal Song Gifts a perpetual, royalty-free, worldwide, irrevocable license to use, reproduce, edit, and distribute this video for any purpose, including but not limited to advertising, social media, website content, and promotional materials."

3. **Disable the "Submit Reaction" button** unless the checkbox is checked (in addition to the existing file-selected check).

4. Add a `consentChecked` state variable (`useState<boolean>(false)`) and wire it to a Radix checkbox component (already available in the project).

### What this gives you

- Explicit, legally robust consent covering ads, social, website, editing rights
- Active opt-in (checkbox) rather than passive notice
- Submit button is blocked until consent is granted
- Uses the existing `Checkbox` and `Label` components already in the project

### Technical details

- New state: `const [consentChecked, setConsentChecked] = useState(false);`
- Button disabled condition changes from `!selectedFile || isUploading` to `!selectedFile || isUploading || !consentChecked`
- Checkbox resets to unchecked if user goes back to lookup step
- No backend changes needed -- consent is implied by successful submission (the checkbox is the gate)

