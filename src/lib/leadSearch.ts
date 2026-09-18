// Orchestration for the admin Leads server-side search.
//
// Extracted from the Admin page so the race-condition behaviour (rapid typing,
// superseded responses, aborts, failures) is testable with an injected request
// function instead of a real network.

export interface LeadSearchRequestArgs<T> {
  term: string;
  signal: AbortSignal;
}

export interface LeadSearchResponse<T> {
  rows: T[] | null;
  total: number;
  error: Error | null;
  aborted?: boolean;
}

export interface LeadSearchHandlers<T> {
  onIdle: () => void;
  onLoading: () => void;
  onResults: (rows: T[], total: number) => void;
  onError: (message: string) => void;
}

export interface LeadSearchRunner<T> {
  run: (rawTerm: string) => Promise<void>;
  /** Exposed for tests/cleanup. */
  cancel: () => void;
}

export function createLeadSearchRunner<T>(opts: {
  minLength: number;
  request: (args: LeadSearchRequestArgs<T>) => Promise<LeadSearchResponse<T>>;
  handlers: LeadSearchHandlers<T>;
}): LeadSearchRunner<T> {
  let seq = 0;
  let controller: AbortController | null = null;

  const cancel = () => {
    controller?.abort();
    controller = null;
  };

  const run = async (rawTerm: string) => {
    const term = rawTerm.trim();
    // Abort whatever is in flight: its response must never paint over a newer one.
    cancel();

    if (term.length < opts.minLength) {
      seq += 1;
      opts.handlers.onIdle();
      return;
    }

    const mySeq = ++seq;
    const myController = new AbortController();
    controller = myController;
    opts.handlers.onLoading();

    let res: LeadSearchResponse<T>;
    try {
      res = await opts.request({ term, signal: myController.signal });
    } catch (err) {
      if (mySeq !== seq) return; // superseded — stay silent
      opts.handlers.onError(err instanceof Error ? err.message : "Search failed.");
      return;
    }

    if (mySeq !== seq || res.aborted) return; // superseded or cancelled

    if (res.error || res.rows === null) {
      opts.handlers.onError(res.error?.message || "Search failed.");
      return;
    }
    opts.handlers.onResults(res.rows, res.total);
  };

  return { run, cancel };
}
