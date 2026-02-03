

# Plan: Add Search Functionality to Orders and Leads

## Overview
Add a search bar to both the Orders and Leads tabs in the admin panel that allows searching by:
- Customer name (first or last)
- Email address
- Recipient name
- Music style/genre
- Keywords in request fields (special qualities, favorite memory, special message)

## Implementation Approach: Client-Side Filtering
Since orders and leads are already fetched in full from the backend, I'll implement **instant client-side search** - no API changes needed. This provides immediate search results as you type.

---

## Technical Changes

### 1. Admin.tsx (Orders Tab)

**Add search state:**
```tsx
const [orderSearch, setOrderSearch] = useState("");
```

**Add search input after status filter:**
```tsx
<Input
  placeholder="Search orders..."
  value={orderSearch}
  onChange={(e) => setOrderSearch(e.target.value)}
  className="w-64"
/>
```

**Add filtering logic:**
```tsx
const filteredOrders = orders.filter((order) => {
  if (!orderSearch.trim()) return true;
  const searchLower = orderSearch.toLowerCase();
  return (
    order.customer_name.toLowerCase().includes(searchLower) ||
    order.customer_email.toLowerCase().includes(searchLower) ||
    order.recipient_name.toLowerCase().includes(searchLower) ||
    order.genre.toLowerCase().includes(searchLower) ||
    order.special_qualities.toLowerCase().includes(searchLower) ||
    order.favorite_memory.toLowerCase().includes(searchLower) ||
    (order.special_message?.toLowerCase().includes(searchLower) ?? false) ||
    (order.singer_preference?.toLowerCase().includes(searchLower) ?? false) ||
    order.occasion.toLowerCase().includes(searchLower)
  );
});
```

### 2. LeadsTable.tsx

**Add search state:**
```tsx
const [searchQuery, setSearchQuery] = useState("");
```

**Add search input to filter bar:**
```tsx
<Input
  placeholder="Search leads..."
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  className="w-64"
/>
```

**Update filtering logic to include search:**
```tsx
const filteredLeads = leads
  .filter((lead) => {
    // Existing filters...
  })
  .filter((lead) => {
    if (!searchQuery.trim()) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      lead.customer_name.toLowerCase().includes(searchLower) ||
      lead.email.toLowerCase().includes(searchLower) ||
      lead.recipient_name.toLowerCase().includes(searchLower) ||
      lead.genre.toLowerCase().includes(searchLower) ||
      lead.special_qualities.toLowerCase().includes(searchLower) ||
      lead.favorite_memory.toLowerCase().includes(searchLower) ||
      (lead.special_message?.toLowerCase().includes(searchLower) ?? false) ||
      (lead.singer_preference?.toLowerCase().includes(searchLower) ?? false) ||
      lead.occasion.toLowerCase().includes(searchLower)
    );
  });
```

---

## Search Fields Covered

| Field | Orders | Leads | Example Search |
|-------|--------|-------|----------------|
| Customer Name | Yes | Yes | "John", "Smith" |
| Customer Email | Yes | Yes | "gmail", "john@" |
| Recipient Name | Yes | Yes | "Mom", "Sarah" |
| Genre/Style | Yes | Yes | "pop", "country" |
| Singer Preference | Yes | Yes | "female", "male" |
| Occasion | Yes | Yes | "birthday", "wedding" |
| Special Qualities | Yes | Yes | "kind", "loving" |
| Favorite Memory | Yes | Yes | "beach", "vacation" |
| Special Message | Yes | Yes | Any keyword |

---

## UI Placement

**Orders Tab:**
```
[Status Filter ▼] [Sort By ▼] [🔍 Search orders...        ] X orders
```

**Leads Tab:**
```
[Status Filter ▼] [Quality ▼] [Sort ▼] [Show ▼] [🔍 Search leads...        ] X leads
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Admin.tsx` | Add `orderSearch` state, search input, and filter logic |
| `src/components/admin/LeadsTable.tsx` | Add `searchQuery` state, search input, and filter logic |

## Benefits
- **Instant results** - no API calls, filters as you type
- **No backend changes** - purely frontend implementation
- **Comprehensive search** - searches across all relevant text fields
- **Works with existing filters** - search combines with status/quality filters

