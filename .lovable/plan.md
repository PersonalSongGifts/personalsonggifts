

## Show Country Info for Both Orders and Leads

### Problem
Country information isn't displayed anywhere in the admin panel -- not for orders (which have `billing_country_code`/`billing_country_name` from Stripe) and not for leads (which don't have country columns at all).

### Solution

**For Orders**: Display `billing_country_name` (with country code) directly from the existing database fields -- no schema changes needed.

**For Leads**: Derive country from the `timezone` field that's already captured from the browser (e.g., "America/New_York" -> "United States", "Europe/London" -> "United Kingdom"). Create a small utility that maps IANA timezones to country names.

### Changes

**1. Create a timezone-to-country utility (`src/lib/timezoneCountry.ts`)**

A lightweight lookup map that converts IANA timezone strings to country names. Covers all major timezone prefixes (America, Europe, Asia, Africa, Australia, Pacific, etc.). This avoids adding new database columns or API calls for leads.

**2. Show country in Order detail view (`src/pages/Admin.tsx`, ~line 1780)**

After the phone number in the customer info section, add:
```
Country: United States (US)
```
Uses `billing_country_name` and `billing_country_code` from the order record. Falls back to timezone-derived country if billing country isn't available.

**3. Show country in Lead detail view (`src/components/admin/LeadsTable.tsx`, ~line 1484)**

After the phone number in the lead customer info section, add:
```
Location: United States (from timezone)
```
Derived from the lead's `timezone` field using the utility. Shown with a subtle "(from timezone)" note since it's inferred rather than from billing data.

### Files Modified

| File | Changes |
|------|---------|
| `src/lib/timezoneCountry.ts` | New file -- timezone-to-country mapping utility |
| `src/pages/Admin.tsx` | Add country display to order detail customer info section |
| `src/components/admin/LeadsTable.tsx` | Add timezone-derived country display to lead detail customer info section |
