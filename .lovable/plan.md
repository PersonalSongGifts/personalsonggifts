

## **QUESTIONS**

**1. For Step 4 (Music Style), the user must pick both Genre AND Singer. Should auto-advance happen as soon as the second one is picked (regardless of order), or should Singer always be picked last? I'm planning to auto-advance when whichever one is picked second completes the pair -- so order doesn't matter.**

**2. Should tapping the same already-selected option (e.g., going back and re-tapping "Husband") also trigger auto-advance, or only new selections?**

---

## What Changes

### Step 1 (Recipient) and Step 3 (Occasion)
Single-selection steps. On click, show the selection highlight for ~400ms, then auto-advance to the next step.

### Step 4 (Music Style)
Has two required fields (genre + singer) and one optional (language). Auto-advance triggers only when the **second** required field is selected -- regardless of which order the user picks them. Language dropdown does NOT trigger auto-advance since it has a default value already.

### Steps 2, 5, 6, 7 -- No Change
These have text inputs, so the Continue button stays as the only way to advance.

---

## Pitfalls and How They're Prevented

| Pitfall | Risk | Prevention |
|---------|------|------------|
| **Double-tap on mobile** advances two steps | User taps a card, auto-advance fires, but the tap also registers on the next step's content | Use a flag to prevent auto-advance from firing more than once per step render. Clear it on step change. |
| **No visual feedback** before transition | User clicks but the page changes so fast they don't see their selection was registered -- feels broken | Add a 400ms delay between selection highlight and step transition. User sees the ring/highlight appear, then the page advances. |
| **Step 3 pre-filled from URL** (`?occasion=birthday`) | User lands on step 3 with occasion already selected. If auto-advance triggers on mount, it'd skip the step without user action | Auto-advance only fires on **click events**, never on mount/initial render. A `useRef` tracks whether the component has mounted to gate this. |
| **Step 4 order-dependent bug** | If auto-advance only triggers on singer click, a user who picks singer first then genre would be stuck | Auto-advance checks if **both** genre and singer are filled after every selection. Fires regardless of which was picked last. |
| **User wants to change their mind on Step 4** | User picks Pop, then picks Male, auto-advances. They go back. They now want to change genre to Country. But singer is already set, so clicking Country would immediately advance again before they can also change singer | This is actually fine -- if they go back and change genre, and singer is still set, it means they're happy with the singer choice. If they want to change singer too, they'd click the new singer which would re-trigger advance. The 400ms delay gives them time to see what's selected. |
| **Accessibility / keyboard navigation** | Screen readers or keyboard users tabbing through cards might accidentally trigger auto-advance | The auto-advance only fires on `onClick`, not on focus. Keyboard users can still use the Continue button which remains visible and functional on all steps. |
| **React strict mode double-render** | In dev, effects run twice, potentially causing double advance | The advance logic uses a ref-based guard that gets set to `true` after firing and only resets on step change. |

---

## Technical Approach

### Callback-based, not effect-based

Rather than using `useEffect` to watch form data changes (which is fragile and can fire on mount), the approach passes an `onAutoAdvance` callback to steps 1, 3, and 4. Each step calls this callback explicitly inside its click handler after updating the form data, but only when the step's requirements are fully met.

This avoids all the mount/re-render pitfalls of effect-based approaches.

### Implementation Details

**`CreateSong.tsx`**:
- Create an `autoAdvance()` function that validates the current step and advances with a 400ms delay
- Pass it as an `onAutoAdvance` prop to RecipientStep, OccasionStep, and MusicStyleStep
- Use a `useRef` flag (`isAutoAdvancing`) to prevent double-fires

**`RecipientStep.tsx`**:
- After `updateFormData({ recipientType: option.id })`, call `onAutoAdvance()`

**`OccasionStep.tsx`**:
- After `updateFormData({ occasion: ... })`, call `onAutoAdvance()`

**`MusicStyleStep.tsx`**:
- After updating genre: check if singer is already selected. If yes, call `onAutoAdvance()`
- After updating singer: check if genre is already selected. If yes, call `onAutoAdvance()`
- Language dropdown change: never calls `onAutoAdvance()`

### Files Modified
- `src/pages/CreateSong.tsx` -- add `autoAdvance` function, pass as prop to 3 steps
- `src/components/create/RecipientStep.tsx` -- accept and call `onAutoAdvance`
- `src/components/create/OccasionStep.tsx` -- accept and call `onAutoAdvance`
- `src/components/create/MusicStyleStep.tsx` -- accept and call `onAutoAdvance`, with genre+singer completion check

### No new files, no new dependencies.

