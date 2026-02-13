

## Valentine's Day Styling for Song Preview Page

### Changes (File: `src/pages/SongPreview.tsx`)

**1. Add Valentine's emojis and pink vibes**
- Header: Change background from solid navy to a gradient with pink/rose tones (`bg-gradient-to-r from-pink-600 to-rose-700`)
- Header emoji: Change `🎵` to `💘`
- Add `💖` emoji next to the "Unlock Your Full Song" heading

**2. Valentine's Day Special banner (when `isVday10` is true)**
- Rename "Valentine's Day Bonus" badge to **"Valentine's Day Special"**
- Change the banner styling to pink: `bg-pink-50 border-pink-300` with pink badge (`bg-pink-500 text-white`)
- Increase the "$10 off" text from `text-sm` to `text-lg font-semibold` so it's much more prominent
- Update copy to: **"$10 OFF — applied automatically at checkout 💖"**

**3. Pricing card pink accents**
- Change hover border from `hover:border-primary` to `hover:border-pink-500` when `isVday10` is true
- Make the price color pink (`text-pink-600`) instead of the default primary when vday10
- CTA button: pink background (`bg-pink-600 hover:bg-pink-700`) when vday10

**4. Promo badge updates**
- Change "Valentine's Bonus" text to "Valentine's Day Special" in all badge variants
- Pink border and text color when vday10: `text-pink-600 border-pink-500`

**5. What stays the same**
- Player card, audio controls, cover art — no changes
- Non-Valentine visitors (no `vday10` param) see the original styling
- All pricing logic unchanged

### Preview of Key Visual Changes

The Valentine's visitor will see:
- A warm pink/rose gradient header with 💘
- A prominent pink "Valentine's Day Special" banner with large "$10 OFF" text
- Pink-accented pricing card and CTA button
- 💖 sprinkled tastefully (heading + discount text only, not overdone)

