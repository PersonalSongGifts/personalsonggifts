

## "Hot Leads" Widget -- Most-Engaged Unconverted Leads

### What It Does

Adds a new card/section to the Analytics tab (or top of the Leads tab) showing leads who have played their preview the most but haven't converted to a purchase yet. These are your warmest prospects -- people who keep coming back to listen but haven't pulled the trigger.

The widget will show a ranked table of the top 10 unconverted leads sorted by `preview_play_count` (descending), displaying:
- Lead name and email
- Play count and last played date
- Occasion and genre
- How long ago they were captured
- A quick "View Lead" button to open their detail dialog

### Where It Lives

A new card in the **Analytics tab**, placed after the existing charts (Revenue, Orders, Status, Genre). It fits naturally here since it's an analytical insight, not an operational action.

### Technical Details

**New file: `src/components/admin/HotLeadsCard.tsx`**
- Accepts the `leads` array (already fetched by Admin.tsx)
- Filters to leads where `status !== "converted"` AND `preview_play_count > 0`
- Sorts by `preview_play_count` descending, takes top 10
- Renders a Card with a small table showing rank, name, email, play count, last played, occasion
- Includes an `onViewLead` callback prop so clicking a row can navigate to the Leads tab and open that lead

**Modified: `src/pages/Admin.tsx`**
- Import and render `HotLeadsCard` in the Analytics tab content area
- Pass `allLeads` and a `handleNavigateToLead` callback (similar pattern to the existing `handleNavigateToOrder`)
- `handleNavigateToLead` switches to the Leads tab and sets the selected lead

### Pitfalls

| Pitfall | Prevention |
|---------|------------|
| No leads have plays yet | Show an empty state: "No preview plays recorded yet" |
| Lead was dismissed but has high plays | Include dismissed leads in the list -- they're still unconverted prospects worth seeing. Show a subtle "dismissed" indicator if applicable |
| Clicking "View Lead" while on Analytics tab | The callback switches tabs and opens the lead dialog, same pattern as the order navigation bridge |

### Files
- **New**: `src/components/admin/HotLeadsCard.tsx`
- **Modified**: `src/pages/Admin.tsx` (import + render in analytics tab + navigation handler)

No database changes. No new dependencies.
