

## Add Prominent Mother's Day Button to Occasion Step

### What
Add a large, eye-catching Mother's Day featured button at the top of the occasion grid (just below the subtitle), with heart emojis and flower decorations. Remove Mother's Day from the regular grid to avoid duplication.

### Changes

**`src/components/create/OccasionStep.tsx`**

1. Add a featured Mother's Day button above the occasion grid:
   - Full-width on mobile, constrained width on desktop
   - Pink/rose gradient background with border
   - Heart emojis (💐🌸💝) surrounding the text
   - Flower emoji accents for the decorative feel
   - Larger text and padding than regular cards
   - Same click behavior (select + auto-advance)
   - Selected state with ring highlight matching the themed colors

2. Remove `mothers-day` from the regular `occasions` array so it only appears as the featured button

3. Responsive approach:
   - Mobile: full-width button with comfortable tap target
   - Tablet/Desktop: centered, max-width ~md, still prominent

### Visual
```text
┌─────────────────────────────────────┐
│  🌸 💝  Mother's Day  💝 🌸        │  ← Featured button (pink bg)
│        💐 🌷 🌺                     │  ← Flower accents below
└─────────────────────────────────────┘

[ Valentine's ] [ Wedding ] [ Anniversary ] [ Baby Lullaby ]
[ Memorial ]    [ Pet Cel ] [ Pet Mem ]     [ Milestone ]
...remaining occasions in normal grid...
```

### Files
| File | Change |
|------|--------|
| `src/components/create/OccasionStep.tsx` | Add featured Mother's Day button, remove from grid |

