
# Meta Pixel Implementation Plan

## Overview
Install Facebook/Meta Pixel tracking on PersonalSongGifts.com to track the complete customer journey from browsing to purchase completion.

## Events to Track

| Event | Trigger Location | Details |
|-------|-----------------|---------|
| **PageView** | All pages | Standard tracking on every page load |
| **ViewContent** | `/create` page | When user starts/progresses through song creation |
| **AddToCart** | Step 7 of `/create` | When "Continue to Checkout" is clicked |
| **InitiateCheckout** | `/checkout` page | When "Complete Payment" is clicked |
| **Purchase** | `/payment-success` page | After successful payment confirmation |

## Implementation Steps

### Step 1: Add Meta Pixel Base Script
Add the Meta Pixel initialization code to `index.html` in the `<head>` section. This will automatically track PageView on every page load.

```html
<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '1231290262288040');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=1231290262288040&ev=PageView&noscript=1"
/></noscript>
<!-- End Meta Pixel Code -->
```

### Step 2: Create Meta Pixel Utility Hook
Create a reusable hook `src/hooks/useMetaPixel.ts` to safely call Facebook Pixel events:

```typescript
declare global {
  interface Window {
    fbq: (...args: unknown[]) => void;
  }
}

export const useMetaPixel = () => {
  const trackEvent = (eventName: string, params?: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', eventName, params);
    }
  };

  return { trackEvent };
};
```

### Step 3: Add ViewContent Event on Song Creation
Update `CreateSong.tsx` to track ViewContent when the user enters the song creation flow:

- Fire ViewContent once when the component mounts (user starts the process)
- Include content category "Custom Song"

### Step 4: Add AddToCart Event on "Continue to Checkout"
Update `CreateSong.tsx` to fire AddToCart when clicking "Continue to Checkout" (Step 7):

- Trigger when `currentStep === TOTAL_STEPS` and form is valid
- Pass form data (non-PII where possible):
  - `content_name`: recipient name
  - `content_category`: occasion
  - Note: Email/phone should be hashed for Advanced Matching (Meta handles this when passed correctly)

### Step 5: Add InitiateCheckout Event on "Complete Payment"
Update `Checkout.tsx` to fire InitiateCheckout when clicking "Complete Payment":

- Include `value` (49 or 79 based on selected tier)
- Include `currency: 'USD'`

### Step 6: Add Purchase Event After Payment Success
Update `PaymentSuccess.tsx` to fire Purchase after successful order processing:

- Include `value` from order details
- Include `currency: 'USD'`
- Include `transaction_id` (order ID)

---

## Technical Details

### Files to Modify

1. **`index.html`** - Add Meta Pixel base script in `<head>`

2. **`src/hooks/useMetaPixel.ts`** (new file) - Reusable pixel tracking hook

3. **`src/pages/CreateSong.tsx`** - Add:
   - ViewContent on component mount
   - AddToCart when submitting Step 7

4. **`src/pages/Checkout.tsx`** - Add:
   - InitiateCheckout when clicking "Complete Payment"

5. **`src/pages/PaymentSuccess.tsx`** - Add:
   - Purchase after successful order confirmation

### Privacy & Security Considerations

- **No plain-text PII logging**: Email and phone numbers will be passed through Meta's standard event parameters which handle hashing automatically
- **Meta Advanced Matching**: When passing `em` (email) and `ph` (phone) parameters, Meta automatically hashes these values
- **Form data**: Only non-sensitive data like occasion, genre, and recipient name will be passed in event parameters

### Event Parameters Summary

| Event | Parameters |
|-------|------------|
| ViewContent | `content_category: "Custom Song"` |
| AddToCart | `content_name`, `content_category`, `value`, `currency` |
| InitiateCheckout | `value`, `currency` |
| Purchase | `value`, `currency`, `transaction_id` |
