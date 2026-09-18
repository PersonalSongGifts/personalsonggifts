import { describe, it, expect, vi } from "vitest";
import { collectAllLeads, pageCountFor, streamRemainingPages } from "@/lib/leadPaging";

type Lead = { id: string };

const leadsForPage = (page: number): Lead[] => [{ id: `p${page}-a` }, { id: `p${page}-b` }];

describe("streamRemainingPages", () => {
  it("commits each page as it lands instead of one batch at the end", async () => {
    const commits: string[][] = [];
    const res = await streamRemainingPages<never, Lead>({
      totalOrders: 100,
      totalLeads: 500, // 5 pages -> 4 background pages
      pageSize: 100,
      fetchPage: async ({ page }) => ({ leads: leadsForPage(page) }),
      onPage: (p) => commits.push((p.leads ?? []).map((l) => l.id)),
      concurrency: 2,
    });
    expect(res).toEqual({ pages: 4, failures: 0 });
    expect(commits).toHaveLength(4);
    expect(commits.flat()).toHaveLength(8);
  });

  it("skips order fetching once all order pages are covered", async () => {
    const skipFlags: boolean[] = [];
    await streamRemainingPages<never, Lead>({
      totalOrders: 100, // 1 order page
      totalLeads: 300, // 3 lead pages
      pageSize: 100,
      fetchPage: async ({ skipOrders }) => { skipFlags.push(skipOrders); return { leads: [] }; },
      onPage: () => {},
    });
    expect(skipFlags).toEqual([true, true]);
  });

  it("reports failed pages instead of pretending the list is complete", async () => {
    const commits: number[] = [];
    const res = await streamRemainingPages<never, Lead>({
      totalOrders: 0,
      totalLeads: 400,
      pageSize: 100,
      fetchPage: async ({ page }) => (page === 2 ? { error: new Error("HTTP 500") } : { leads: leadsForPage(page) }),
      onPage: (p) => commits.push((p.leads ?? []).length),
    });
    expect(res.failures).toBe(1);
    expect(commits).toHaveLength(2);
  });

  it("does nothing when a single page covers everything", async () => {
    const fetchPage = vi.fn();
    const res = await streamRemainingPages<never, Lead>({
      totalOrders: 10,
      totalLeads: 42,
      pageSize: 100,
      fetchPage,
      onPage: () => {},
    });
    expect(fetchPage).not.toHaveBeenCalled();
    expect(res).toEqual({ pages: 0, failures: 0 });
  });

  it("page maths matches production reality (29,139 leads @ 100)", () => {
    expect(pageCountFor(29139, 100)).toBe(292);
  });
});

describe("collectAllLeads (CSV export)", () => {
  it("returns every lead across all pages", async () => {
    const all = await collectAllLeads<Lead>({
      pageSize: 100,
      fetchFirst: async () => ({ leads: leadsForPage(0), totalLeads: 400 }),
      fetchPage: async (page) => ({ leads: leadsForPage(page) }),
    });
    expect(all).not.toBeNull();
    expect(all!).toHaveLength(8);
  });

  it("returns null when ANY page fails, so no partial file is written", async () => {
    const all = await collectAllLeads<Lead>({
      pageSize: 100,
      fetchFirst: async () => ({ leads: leadsForPage(0), totalLeads: 400 }),
      fetchPage: async (page) => (page === 3 ? { error: new Error("timed out") } : { leads: leadsForPage(page) }),
    });
    expect(all).toBeNull();
  });

  it("returns null when the first page fails", async () => {
    const all = await collectAllLeads<Lead>({
      pageSize: 100,
      fetchFirst: async () => ({ error: new Error("HTTP 500") }),
      fetchPage: async () => ({ leads: [] }),
    });
    expect(all).toBeNull();
  });

  it("reports progress against the server total, not the loaded array", async () => {
    const progress: Array<[number, number]> = [];
    await collectAllLeads<Lead>({
      pageSize: 100,
      fetchFirst: async () => ({ leads: leadsForPage(0), totalLeads: 29139 }),
      fetchPage: async (page) => ({ leads: leadsForPage(page) }),
      onProgress: (loaded, total) => progress.push([loaded, total]),
      concurrency: 5,
    });
    expect(progress[0]).toEqual([2, 29139]);
    expect(progress.every(([, total]) => total === 29139)).toBe(true);
  });
});
