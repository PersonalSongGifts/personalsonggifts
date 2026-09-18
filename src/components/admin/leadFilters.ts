// Pure filter/sort helpers for the admin Leads table.
//
// Text search now happens in the database (see supabase/functions/_shared/
// lead-search.ts). These client-side filters only narrow whatever row set is
// on screen — either the newest-first page fill or the server search results.

export type LeadSortMode = "latest" | "oldest" | "quality";
export type DismissedFilter = "active" | "dismissed" | "all";

export interface FilterableLead {
  id: string;
  status: string;
  captured_at: string;
  dismissed_at?: string | null;
  quality_score?: number | null;
}

export interface LeadFilterOptions {
  statusFilter: string;
  qualityFilter: string;
  dismissedFilter: DismissedFilter;
  sort: LeadSortMode;
}

export function applyLeadFilters<T extends FilterableLead>(
  rows: T[],
  { statusFilter, qualityFilter, dismissedFilter, sort }: LeadFilterOptions,
): T[] {
  return rows
    .filter((lead) => {
      if (dismissedFilter === "active") return !lead.dismissed_at;
      if (dismissedFilter === "dismissed") return !!lead.dismissed_at;
      return true;
    })
    .filter((lead) => statusFilter === "all" || lead.status === statusFilter)
    .filter((lead) => {
      if (qualityFilter === "all") return true;
      const score = lead.quality_score ?? 0;
      if (qualityFilter === "high") return score >= 70;
      if (qualityFilter === "medium") return score >= 40 && score < 70;
      if (qualityFilter === "low") return score < 40;
      return true;
    })
    .sort((a, b) => {
      if (sort === "quality") return (b.quality_score ?? 0) - (a.quality_score ?? 0);
      const dateA = new Date(a.captured_at).getTime();
      const dateB = new Date(b.captured_at).getTime();
      return sort === "latest" ? dateB - dateA : dateA - dateB;
    });
}

/** True once the term is long enough to be sent to the server. */
export function isServerSearchActive(searchQuery: string, minLength: number): boolean {
  return searchQuery.trim().length >= minLength;
}

/**
 * Decides what the leads table should render. Keeping this pure makes the
 * "never spin forever" rule testable.
 */
export type LeadsViewState =
  | { kind: "error"; message: string; retry: "search" | "load" }
  | { kind: "loading"; message: string }
  | { kind: "empty"; message: string }
  | { kind: "rows" };

export function resolveLeadsViewState(input: {
  serverSearchActive: boolean;
  searchLoading: boolean;
  searchError: string | null;
  searchResultCount: number | null;
  loading: boolean;
  listError: string | null;
  visibleRowCount: number;
}): LeadsViewState {
  if (input.serverSearchActive) {
    if (input.searchError) return { kind: "error", message: input.searchError, retry: "search" };
    if (input.searchLoading && input.searchResultCount === null) {
      return { kind: "loading", message: "Searching all leads..." };
    }
    if (input.visibleRowCount === 0) return { kind: "empty", message: "No leads match this search" };
    return { kind: "rows" };
  }
  if (input.listError) return { kind: "error", message: input.listError, retry: "load" };
  if (input.loading && input.visibleRowCount === 0) {
    return { kind: "loading", message: "Loading leads..." };
  }
  if (input.visibleRowCount === 0) return { kind: "empty", message: "No leads found" };
  return { kind: "rows" };
}
