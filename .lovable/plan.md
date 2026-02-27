

## UI Improvements to Song Revision Page and Thank You Page

### Changes

**1. Remove Tempo section from SongRevision.tsx**
- Delete the Tempo radio group card (lines 466-483) and the `tempoOptions` array (lines 37-41)

**2. Remove "No preference" option from Singer Voice Preference**
- Delete the third radio option for "no-preference" (lines 402-406) in SongRevision.tsx

**3. Update pronunciation example text**
- Change `'Mee-SHELL' instead of 'Michelle'` to `'Mishell' instead of 'Michelle'` (line 427)
- Update the secondary helper text to match Suno-friendly phonetic style (line 428)

**4. Link "Terms of Service" in disclaimers**
- In the disclaimers rendering (lines 509-514), make the "Terms of Service" text in the TOS disclaimer a clickable link to `/terms-of-service`

**5. Make revision link a styled button on PaymentSuccess.tsx**
- Replace the plain text link (lines 359-368) with a proper outlined Button component with a pencil/edit icon, making it more visually prominent

**6. Make revision link a button in confirmation email (send-order-confirmation)**
- Update the email template's revision link to use a styled button instead of a plain hyperlink

### Technical Details

- **SongRevision.tsx**: Remove tempo block, remove "no-preference" radio, update pronunciation helper text, render TOS disclaimer label with an inline `<a>` link
- **PaymentSuccess.tsx**: Replace the `<div>` with text link to a `<Button variant="outline">` wrapped in a `<Link>`
- **send-order-confirmation/index.ts**: Style the revision link as an HTML button in the email template
