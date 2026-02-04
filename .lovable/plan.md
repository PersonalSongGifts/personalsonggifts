
# Fix Song Link After Purchase & Email Deliverability

## Problem Summary

Two issues with lead-to-order conversion:

1. **Broken Link After Purchase**: When Maya refreshed the preview page after buying, she saw "Check your email" instead of her song. The preview endpoint blocks converted leads entirely.

2. **Email Going to Spam**: The song delivery email landed in Gmail spam folder.

---

## Technical Analysis

### Issue 1: Preview Page Blocks Converted Leads

Current flow:
```text
User on /preview/[token] → Purchases → Still on /preview/[token]
                                       ↓ (refresh)
                       get-lead-preview returns 410 "already purchased"
                                       ↓
                       Shows error: "Check your email for the full song"
```

The `get-lead-preview` function (line 44-48) returns an error when `lead.status === "converted"`, leaving the user stranded.

### Issue 2: Email Deliverability

The email has proper headers (Message-ID, List-Unsubscribe) but may trigger spam filters due to:
- New sender domain reputation
- Emoji in subject line (minor factor)
- "We're thrilled" marketing language

---

## Solution

### Fix 1: Redirect Converted Leads to Full Song Page

Update `SongPreview.tsx` to detect the "already converted" response and automatically redirect to the song player page.

**Changes to `src/pages/SongPreview.tsx`:**
- Detect the `converted: true` response from `get-lead-preview`
- Query the lead's associated `order_id` to get the song link
- Redirect the user to `/song/[orderId]` instead of showing an error

**Changes to `supabase/functions/get-lead-preview/index.ts`:**
- When lead is converted, return the `orderId` in the response so the frontend can redirect

### Fix 2: Improve Email Deliverability

Update `send-song-delivery/index.ts` with:
- Add `Precedence: bulk` header to indicate transactional email
- Add `X-Priority: 1` to mark as high priority
- Ensure plain text version matches HTML content exactly
- Keep emojis (they're brand identity) but tone down marketing language slightly

---

## Implementation Details

### File 1: `supabase/functions/get-lead-preview/index.ts`

Return `orderId` when lead is converted so frontend can redirect:

```typescript
// Line 44-48: Update the converted response
if (lead.status === "converted") {
  // Get the order_id so the frontend can redirect
  const { data: leadWithOrder } = await supabase
    .from("leads")
    .select("order_id")
    .eq("id", lead.id)
    .single();
  
  return new Response(
    JSON.stringify({ 
      error: "This song has already been purchased", 
      converted: true,
      orderId: leadWithOrder?.order_id 
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

### File 2: `src/pages/SongPreview.tsx`

Redirect to song page when converted:

```typescript
// In fetchPreview function, update the converted handling (around line 49-54)
if (!response.ok) {
  const data = await response.json();
  if (data.converted && data.orderId) {
    // Redirect to the full song page
    window.location.href = `/song/${data.orderId.slice(0, 8)}`;
    return;
  } else if (data.converted) {
    setError("This song has been purchased! Check your email for the full song link.");
  } else {
    setError(data.error || "Preview not found");
  }
  setLoading(false);
  return;
}
```

### File 3: `supabase/functions/send-song-delivery/index.ts`

Improve email headers for deliverability:

```typescript
// Update headers object (around line 165-170)
headers: {
  "Message-ID": messageId,
  "X-Entity-Ref-ID": orderId,
  "X-Priority": "1",
  "Precedence": "transactional",
  "List-Unsubscribe": `<mailto:support@personalsonggifts.com?subject=Unsubscribe>, <https://personalsonggifts.lovable.app/unsubscribe?email=${encodeURIComponent(customerEmail)}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
}
```

Optionally soften the marketing language slightly:
- Change "We're thrilled to deliver" → "Your personalized song is ready"
- Keep emojis in subject (brand identity)

---

## Additional Recommendations for Email Deliverability

| Action | Priority | Notes |
|--------|----------|-------|
| Verify Brevo DKIM/SPF/DMARC | High | Check Brevo dashboard for domain authentication status |
| Send from subdomain | Medium | Consider `mail.personalsonggifts.com` to protect main domain reputation |
| Warm up sender | Medium | Start with low volume and gradually increase |
| Add customers to safe sender | User action | Include "Add us to contacts" in email footer |

---

## Summary

| Issue | Root Cause | Fix |
|-------|------------|-----|
| Song link broken after refresh | Preview endpoint blocks converted leads | Return orderId in response, redirect to `/song/[orderId]` in frontend |
| Email going to spam | New sender + transactional headers missing | Add X-Priority, Precedence headers; soften marketing language |
