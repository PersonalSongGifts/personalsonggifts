

## Make Follow-Up Email + Song Pages Promo-Aware with Urgency

### Current State

1. **Follow-up email** (`send-lead-followup`): Hardcodes "$10 off" and "$39.99". No awareness of active promos. If Easter ($24.99) is running, the email advertises a worse deal than the site.

2. **SongPreview page** (lead landing `/preview/:token`): Shows promo price if active, but no urgency messaging. Just a static badge with the promo name.

3. **SongPlayer page** (delivered song `/song/:orderId`): Zero promo awareness. No sale banner. The "Create your own personalized song" link at the bottom doesn't mention any deal.

### Spam Considerations

The current email style (plain, personal, white background, Arial font) is good for deliverability. The fix will keep that style. Key rules:
- No ALL CAPS subject lines, no excessive exclamation marks
- No "FREE" or "ACT NOW" in subject
- Keep the personal, conversational tone
- The subject line stays as-is: `[Name]'s song is still waiting` (proven deliverable)
- Promo mention goes in the body only, naturally woven in

### Changes

**1. `supabase/functions/send-lead-followup/index.ts`**

- Before building the email, query `promotions` for an active promo (same query as `get-active-promo`)
- Update `buildFollowupEmail` to accept optional promo object
- **If promo active**: Replace "$10 off" paragraph with something like:
  > "We're running a sale right now — get the full song for just $24.99 (normally $99.99). The discount is already applied to the link below."
- **If no promo active**: Keep existing "$10 off" copy as the default
- Activity log records which offer was sent

**2. `src/pages/SongPreview.tsx`** — Add urgency banner

- When `activeFlashPromo.active`, show a prominent urgency strip above the pricing card:
  > "🔥 Sale happening now — don't miss out!"
- Style: colored background matching the promo banner colors, bold text
- Replace the static promo badge at bottom with urgency copy like "Limited time offer — act now"
- No specific end date mentioned (per your request)

**3. `src/pages/SongPlayer.tsx`** — Add promo-aware CTA

- Import `useActivePromo`
- When a promo is active, add a subtle but noticeable banner/card above the footer CTA:
  > "🎵 Want a song for someone else? We're running a sale right now — don't miss out!"
  > [Create a Song →] button linking to `/create`
- This targets delivered-song recipients who might want to gift another song
- When no promo active, this section doesn't appear (keeps the page clean)

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/send-lead-followup/index.ts` | Query active promo, dynamic email copy |
| `src/pages/SongPreview.tsx` | Urgency banner + updated promo badge text |
| `src/pages/SongPlayer.tsx` | Import `useActivePromo`, add sale CTA card |

### Email Copy Examples

**With Easter promo active ($24.99):**
> "We're running a sale right now — get the full song for just $24.99 (normally $99.99). No code needed, the discount is already applied to the link below."

**With no promo (default):**
> "So we're taking $10 off — no code needed, it's already applied to the link below."

Both maintain the plain, personal email style that avoids spam filters.

