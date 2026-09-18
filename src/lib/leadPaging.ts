// Page-fan-out helpers for the admin lists.
//
// Extracted from Admin.tsx so the progressive-commit and
// export-completeness rules are testable with an injected page fetcher.

export interface PageResult<TOrder, TLead> {
  orders?: TOrder[];
  leads?: TLead[];
  error?: Error | null;
}

export type PageFetcher<TOrder, TLead> = (args: {
  page: number;
  pageSize: number;
  skipOrders: boolean;
}) => Promise<PageResult<TOrder, TLead>>;

/** Runs tasks with bounded concurrency, preserving completion independence. */
export async function runPooledTasks(tasks: Array<() => Promise<void>>, concurrency = 5): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      try {
        await tasks[i]();
      } catch {
        // Individual task failures are reported by the task itself.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
}

export function pageCountFor(total: number, pageSize: number): number {
  return Math.ceil((total || 0) / pageSize);
}

/**
 * Fetches pages 1..n, handing each page to `onPage` as soon as it lands so the
 * UI can commit progressively. Returns how many pages failed — the caller must
 * surface a non-zero count (totals/export would otherwise look complete).
 */
export async function streamRemainingPages<TOrder, TLead>(args: {
  totalOrders: number;
  totalLeads: number;
  pageSize: number;
  fetchPage: PageFetcher<TOrder, TLead>;
  onPage: (page: PageResult<TOrder, TLead>) => void;
  concurrency?: number;
}): Promise<{ pages: number; failures: number }> {
  const orderPages = pageCountFor(args.totalOrders, args.pageSize);
  const leadPages = pageCountFor(args.totalLeads, args.pageSize);
  const maxPages = Math.max(orderPages, leadPages);
  if (maxPages <= 1) return { pages: 0, failures: 0 };

  let failures = 0;
  await runPooledTasks(
    Array.from({ length: maxPages - 1 }, (_, i) => async () => {
      const res = await args.fetchPage({
        page: i + 1,
        pageSize: args.pageSize,
        skipOrders: i + 1 >= orderPages,
      });
      if (res.error) {
        failures += 1;
        return;
      }
      args.onPage(res);
    }),
    args.concurrency ?? 5,
  );
  return { pages: maxPages - 1, failures };
}

/**
 * Collects EVERY lead for a CSV export. Returns null if any page fails, so an
 * export can never silently contain only part of the dataset.
 */
export async function collectAllLeads<TLead>(args: {
  pageSize: number;
  fetchFirst: () => Promise<{ leads?: TLead[]; totalLeads?: number; error?: Error | null }>;
  fetchPage: (page: number) => Promise<{ leads?: TLead[]; error?: Error | null }>;
  onProgress?: (loaded: number, total: number) => void;
  concurrency?: number;
}): Promise<TLead[] | null> {
  const first = await args.fetchFirst();
  if (first.error) return null;
  const total = first.totalLeads ?? 0;
  const collected: TLead[] = [...(first.leads ?? [])];
  args.onProgress?.(collected.length, total);

  const pages = pageCountFor(total, args.pageSize);
  if (pages > 1) {
    let failed = false;
    await runPooledTasks(
      Array.from({ length: pages - 1 }, (_, i) => async () => {
        const res = await args.fetchPage(i + 1);
        if (res.error) {
          failed = true;
          return;
        }
        collected.push(...(res.leads ?? []));
        args.onProgress?.(collected.length, total);
      }),
      args.concurrency ?? 5,
    );
    if (failed) return null;
  }
  return collected;
}
