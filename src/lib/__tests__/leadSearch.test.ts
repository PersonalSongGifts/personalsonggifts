import { describe, it, expect, vi } from "vitest";
import { createLeadSearchRunner } from "@/lib/leadSearch";
import { applyLeadFilters, isServerSearchActive, resolveLeadsViewState } from "@/components/admin/leadFilters";

type Row = { id: string };

function makeHandlers() {
  return {
    onIdle: vi.fn(),
    onLoading: vi.fn(),
    onResults: vi.fn(),
    onError: vi.fn(),
  };
}

const rene: Row = { id: "4f21b8de-746b-4e22-8d9f-b434a1e2bfd6" };

describe("lead search runner", () => {
  it("finds a lead by exact email without loading the whole list", async () => {
    const handlers = makeHandlers();
    const request = vi.fn(async ({ term }) => {
      expect(term).toBe("renedarwent@gmail.com");
      return { rows: [rene], total: 1, error: null };
    });
    const runner = createLeadSearchRunner<Row>({ minLength: 2, request, handlers });
    await runner.run("  renedarwent@gmail.com  ");
    expect(request).toHaveBeenCalledTimes(1);
    expect(handlers.onResults).toHaveBeenCalledWith([rene], 1);
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it("passes partial names and pasted preview links straight through", async () => {
    const seen: string[] = [];
    const runner = createLeadSearchRunner<Row>({
      minLength: 2,
      request: async ({ term }) => { seen.push(term); return { rows: [rene], total: 1, error: null }; },
      handlers: makeHandlers(),
    });
    await runner.run("darwent");
    await runner.run("https://www.personalsonggifts.com/preview/L3pZGpC2JdJyTGAe");
    expect(seen).toEqual(["darwent", "https://www.personalsonggifts.com/preview/L3pZGpC2JdJyTGAe"]);
  });

  it("reports zero results as results, never as an error or a spinner", async () => {
    const handlers = makeHandlers();
    const runner = createLeadSearchRunner<Row>({
      minLength: 2,
      request: async () => ({ rows: [], total: 0, error: null }),
      handlers,
    });
    await runner.run("zzzznotreal");
    expect(handlers.onResults).toHaveBeenCalledWith([], 0);
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it("rapid typing: a slow earlier response can never overwrite the newer one", async () => {
    const handlers = makeHandlers();
    const resolvers: Array<(v: { rows: Row[]; total: number; error: null }) => void> = [];
    const runner = createLeadSearchRunner<Row>({
      minLength: 2,
      request: () => new Promise((resolve) => { resolvers.push(resolve); }),
      handlers,
    });

    const first = runner.run("re");
    const second = runner.run("renedarwent");
    // Newest resolves first, then the stale one answers late.
    resolvers[1]({ rows: [rene], total: 1, error: null });
    resolvers[0]({ rows: [{ id: "stale" }], total: 999, error: null });
    await Promise.all([first, second]);

    expect(handlers.onResults).toHaveBeenCalledTimes(1);
    expect(handlers.onResults).toHaveBeenCalledWith([rene], 1);
  });

  it("aborts the in-flight request when a new keystroke arrives", async () => {
    const aborts: boolean[] = [];
    const runner = createLeadSearchRunner<Row>({
      minLength: 2,
      request: ({ signal }) => new Promise((resolve) => {
        signal.addEventListener("abort", () => { aborts.push(true); resolve({ rows: null, total: 0, error: null, aborted: true }); });
      }),
      handlers: makeHandlers(),
    });
    const p = runner.run("re");
    void runner.run("ren");
    await p;
    expect(aborts).toEqual([true]);
  });

  it("clearing the box (or a too-short term) goes idle and cancels work", async () => {
    const handlers = makeHandlers();
    const request = vi.fn(async () => ({ rows: [rene], total: 1, error: null }));
    const runner = createLeadSearchRunner<Row>({ minLength: 2, request, handlers });
    await runner.run("r");
    await runner.run("");
    expect(request).not.toHaveBeenCalled();
    expect(handlers.onIdle).toHaveBeenCalledTimes(2);
  });

  it("surfaces a timeout as a retryable error, not an endless spinner", async () => {
    const handlers = makeHandlers();
    const runner = createLeadSearchRunner<Row>({
      minLength: 2,
      request: async () => ({ rows: null, total: 0, error: new Error("The request timed out after 20 seconds.") }),
      handlers,
    });
    await runner.run("renedarwent");
    expect(handlers.onError).toHaveBeenCalledWith("The request timed out after 20 seconds.");
    expect(handlers.onResults).not.toHaveBeenCalled();
  });

  it("a thrown request rejection is reported, and retry works afterwards", async () => {
    const handlers = makeHandlers();
    let fail = true;
    const runner = createLeadSearchRunner<Row>({
      minLength: 2,
      request: async () => {
        if (fail) throw new Error("Failed to fetch");
        return { rows: [rene], total: 1, error: null };
      },
      handlers,
    });
    await runner.run("renedarwent");
    expect(handlers.onError).toHaveBeenCalledWith("Failed to fetch");
    fail = false;
    await runner.run("renedarwent");
    expect(handlers.onResults).toHaveBeenCalledWith([rene], 1);
  });
});

describe("leads view state", () => {
  const base = {
    serverSearchActive: false,
    searchLoading: false,
    searchError: null as string | null,
    searchResultCount: null as number | null,
    loading: false,
    listError: null as string | null,
    visibleRowCount: 0,
  };

  it("shows 'Loading leads...' only while the first page is in flight", () => {
    expect(resolveLeadsViewState({ ...base, loading: true }).kind).toBe("loading");
    // Page 0 arrived; background pages still filling -> rows, not loading.
    expect(resolveLeadsViewState({ ...base, loading: false, visibleRowCount: 100 }).kind).toBe("rows");
  });

  it("a first-page failure yields a retryable error, never a spinner", () => {
    const s = resolveLeadsViewState({ ...base, loading: true, listError: "The request timed out after 20 seconds." });
    expect(s).toEqual({ kind: "error", message: "The request timed out after 20 seconds.", retry: "load" });
  });

  it("search failure offers a search retry", () => {
    const s = resolveLeadsViewState({ ...base, serverSearchActive: true, searchError: "boom" });
    expect(s).toEqual({ kind: "error", message: "boom", retry: "search" });
  });

  it("search with no matches says so instead of spinning", () => {
    const s = resolveLeadsViewState({ ...base, serverSearchActive: true, searchResultCount: 0, visibleRowCount: 0 });
    expect(s).toEqual({ kind: "empty", message: "No leads match this search" });
  });

  it("search in flight with no previous results shows a searching state", () => {
    const s = resolveLeadsViewState({ ...base, serverSearchActive: true, searchLoading: true });
    expect(s.kind).toBe("loading");
  });

  it("a refresh landing during an active search never re-enters full-list loading", () => {
    const s = resolveLeadsViewState({
      ...base,
      serverSearchActive: true,
      loading: true, // parent refresh in flight
      searchResultCount: 1,
      visibleRowCount: 1,
    });
    expect(s.kind).toBe("rows");
  });

  it("minimum search length gate", () => {
    expect(isServerSearchActive("r", 2)).toBe(false);
    expect(isServerSearchActive("  re  ", 2)).toBe(true);
  });
});

describe("client-side filters applied on top of search results", () => {
  const rows = [
    { id: "a", status: "lead", captured_at: "2026-01-01T00:00:00Z", quality_score: 90, dismissed_at: null },
    { id: "b", status: "converted", captured_at: "2026-02-01T00:00:00Z", quality_score: 50, dismissed_at: null },
    { id: "c", status: "lead", captured_at: "2026-03-01T00:00:00Z", quality_score: 10, dismissed_at: "2026-03-02T00:00:00Z" },
  ];

  it("defaults hide dismissed and sort newest first", () => {
    const out = applyLeadFilters(rows, { statusFilter: "all", qualityFilter: "all", dismissedFilter: "active", sort: "latest" });
    expect(out.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("status and quality filters narrow search results without refetching", () => {
    expect(applyLeadFilters(rows, { statusFilter: "converted", qualityFilter: "all", dismissedFilter: "active", sort: "latest" }).map((r) => r.id)).toEqual(["b"]);
    expect(applyLeadFilters(rows, { statusFilter: "all", qualityFilter: "high", dismissedFilter: "active", sort: "latest" }).map((r) => r.id)).toEqual(["a"]);
    expect(applyLeadFilters(rows, { statusFilter: "all", qualityFilter: "all", dismissedFilter: "dismissed", sort: "latest" }).map((r) => r.id)).toEqual(["c"]);
  });

  it("does not mutate the source array (search results stay intact)", () => {
    const snapshot = rows.map((r) => r.id);
    applyLeadFilters(rows, { statusFilter: "all", qualityFilter: "all", dismissedFilter: "all", sort: "oldest" });
    expect(rows.map((r) => r.id)).toEqual(snapshot);
  });
});
