

## Add "USD" Labels to All Customer-Facing Prices

A small, low-maintenance change to make it clear that all prices are in US Dollars.

### Changes

#### 1. `src/pages/Checkout.tsx`

- **Strikethrough prices** (lines 343, 395): `$99.99` → `$99.99 USD`, `$159.99` → `$159.99 USD`
- **Dynamic price displays** (lines 344-346, 396-397): append ` USD` after the dollar amount
- **Order summary subtotal** (line 501): append ` USD`
- **Total line** (line 521): append ` USD`
- **Checkout button** (line 554): append ` USD` to the price in the button text
- **Add a small note** below the pricing cards (around line 415): `"All prices in USD. Local currency shown at checkout."`

#### 2. `src/pages/SongPreview.tsx`

- **Strikethrough price** (line 441): `$99.99` → `$99.99 USD`
- **Dynamic prices** (lines 443-449): append ` USD` to each price string (`$49.99 USD`, `$44.99 USD`, `$39.99 USD`, `$34.99 USD`)

#### 3. `src/pages/PaymentSuccess.tsx`

- **Price paid line** (line 237): append ` USD` after the displayed price

#### 4. `src/components/home/FAQSection.tsx`

- Add one new FAQ entry: **"What currency are your prices in?"** → "All prices are listed in US Dollars (USD). When you proceed to checkout, the payment page will show the equivalent amount in your local currency."

### No changes needed to
- Backend / Stripe configuration
- Admin pages (internal only)
- Homepage (no prices displayed)

