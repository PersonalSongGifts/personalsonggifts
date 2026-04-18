

## Plan: Update bonus-track email copy

Edit `supabase/functions/send-bonus-track-email/index.ts` — replace `buildEmail()` subject/html/text with the new copy.

**New subject:** `A second version of [Recipient]'s song`

**New body** (dynamic fields `${firstName}` and `${order.recipient_name}` already wired):

> Hi [FirstName],
>
> We loved making your song so much that we also produced a second version in a different style that we think you'd love as a little bonus. It's sitting on your song page, ready to listen (scroll down).
>
> [link to song page]
>
> Have a listen and see which version you and [Recipient] like more.
>
> If you'd rather not hear from us about this, just reply with "no thanks" and we'll stop.
>
> — Personal Song Gifts team

Sign-off changes from "— Mike / Personal Song Gifts" to "— Personal Song Gifts team". Link rendered as bare URL on its own line (matches existing plain personal style).

No other changes — eligibility logic, admin panel, toggle, stats, and DB schema all stay as-is.

