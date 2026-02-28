

## Persist Form Data Across Stripe Redirect

### Problem

Form data is passed to the checkout page via React Router's `location.state`, which is lost when the user navigates to Stripe's external checkout page and clicks the browser back button. They see "No order found" and have to start over.

### Solution

Save form data to `sessionStorage` at two points, and restore it on the checkout page when `location.state` is empty. This way, if someone clicks back from Stripe, their order details are still there.

### Changes

#### 1. `src/pages/CreateSong.tsx`

- Save form data to `sessionStorage` right before navigating to checkout (alongside the existing `navigate("/checkout", { state: { formData } })` call)
- Key: `"songFormData"`
- Value: JSON-serialized form data

#### 2. `src/pages/Checkout.tsx`

- When `location.state?.formData` is missing, attempt to restore from `sessionStorage` before showing the "No order found" screen
- Clear `sessionStorage` on successful redirect to Stripe (after receiving the checkout URL) so stale data doesn't persist indefinitely
- This requires converting the `formData` from a simple `const` derived from location state into component state that can be set from either source

### How It Works

```text
User fills form --> CreateSong saves to sessionStorage + navigates to /checkout
                    --> Checkout reads from location.state (primary) or sessionStorage (fallback)
                        --> User clicks "Purchase" --> saves to sessionStorage again, redirects to Stripe
                            --> User clicks browser back --> Checkout restores from sessionStorage
```

### Technical Details

**CreateSong.tsx** (1 change near line 266):
- Add `sessionStorage.setItem("songFormData", JSON.stringify(formData))` before `navigate("/checkout", ...)`

**Checkout.tsx** (3 changes):
1. Replace the simple `const formData = location.state?.formData` with a state variable initialized from either `location.state` or `sessionStorage`
2. In `handleCheckout`, after receiving the Stripe URL and before redirecting, re-save to sessionStorage (it's already there from CreateSong, but this ensures the selected tier is also preserved if needed)
3. Clear sessionStorage key `"songFormData"` only on the PaymentSuccess page (not on checkout) so the data persists through the Stripe round-trip

**PaymentSuccess.tsx** (1 small addition):
- Add `sessionStorage.removeItem("songFormData")` on mount to clean up after successful purchase

### Files Modified

| File | Change |
|------|--------|
| `src/pages/CreateSong.tsx` | Save formData to sessionStorage before navigating to checkout |
| `src/pages/Checkout.tsx` | Fall back to sessionStorage when location.state is empty |
| `src/pages/PaymentSuccess.tsx` | Clear sessionStorage on successful payment |

