
# Song Delivery Email Branding Update

## Overview
Restyle the Song Delivery email to match your brand's navy and cream palette while keeping the green header as a celebration accent.

## Visual Changes

### Current vs Updated Design

| Element | Current | Updated |
|---------|---------|---------|
| Background | Off-white #f8f4f0 | Cream #FDF8F3 (matches Order Confirmation) |
| Content area | #FFFEF9 | #FFFBF5 (matches Order Confirmation) |
| "Listen" button | Brown #8B4513 | Navy #1E3A5F (brand primary) |
| Tips box | Yellow-tinted #FFF8E7 | Light blue #F5F8FB (matches Order Confirmation style) |
| Tips heading color | Brown #8B4513 | Navy #1E3A5F |
| Order ID box | Green tinted #E8F5E8 | Light blue #EEF3F8 |
| Footer link | Brown #8B4513 | Navy #1E3A5F |
| Signature color | Brown #8B4513 | Navy #1E3A5F |

### What Stays the Same
- Green header gradient (the celebration "Your Song is Ready!" moment)
- Overall layout and spacing
- Tips for Sharing content
- Emoji usage

## Files to Update

| File | Changes |
|------|---------|
| `supabase/functions/send-song-delivery/index.ts` | Update HTML template colors |
| `src/components/admin/EmailTemplates.tsx` | Update preview template to match |

## Technical Details

### Color Mapping
```text
Brown #8B4513 → Navy #1E3A5F
Yellow-tint #FFF8E7 → Light blue #F5F8FB
Green-tint #E8F5E8 → Light blue #EEF3F8
Off-white #f8f4f0 → Cream #FDF8F3
Off-white #FFFEF9 → Cream #FFFBF5
```

### Button Styling
The "Listen to Your Song" button will change from brown gradient to navy gradient:
```
Before: background: linear-gradient(135deg, #8B4513 0%, #A0522D 100%)
After:  background: linear-gradient(135deg, #1E3A5F 0%, #2C4A6E 100%)
```

## Result
The Song Delivery email will feel cohesive with your Order Confirmation email while the green header provides a distinct "celebration" moment that signals good news to customers.
