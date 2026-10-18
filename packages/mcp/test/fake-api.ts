/** A fake Reconcile API for tool tests: canned answers by path, and a log of every request. */
export interface Logged {
  method: string;
  path: string;
  query: string;
}

export function fakeApi(routes: Record<string, unknown>) {
  const log: Logged[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    log.push({ method: req.method, path: url.pathname, query: url.search });
    if (!(url.pathname in routes))
      return new Response(
        JSON.stringify({ title: 'Not found', status: 404, detail: `No ${url.pathname}` }),
        {
          status: 404,
          headers: { 'content-type': 'application/problem+json' },
        },
      );
    const route = routes[url.pathname];
    const body = typeof route === 'function' ? (route as (u: URL) => unknown)(url) : route;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetch: fetchImpl, log };
}

export const exception = (i: number, over: Record<string, unknown> = {}) => ({
  id: `e${i}`,
  poNumber: `HP-PO-${100000 + i}`,
  vendorName: i % 2 ? 'Greenvale Snacks LLC' : 'Ashpoint Paper Goods',
  type: 'PRICE_VARIANCE',
  status: 'OPEN',
  informational: false,
  amount: `${100 - i}.10`,
  explanation: `PO price $1.00, invoice $1.10 on line ${i}.`,
  lines: [],
  documentIds: [],
  carriedOverFromId: null,
  matchRunVersion: 1,
  decision: null,
  ...over,
});

const line = (
  description: string,
  qty: number,
  unitPrice: string | null,
  sku: string | null = 'SKU-1',
) => ({
  docId: 'd',
  docNumber: 'X',
  lineNo: 1,
  sku,
  description,
  qty,
  uom: 'CS',
  unitPrice,
  lineTotal: null,
});

export const setDetail = {
  poNumber: 'HP-PO-104386',
  vendorName: 'Greenvale Snacks LLC',
  groupedInto: null,
  status: 'MATCHED',
  provisional: false,
  notes: [],
  waitingUntil: null,
  openExceptions: 1,
  documents: [
    {
      id: 'd1',
      status: 'MATCHED',
      type: 'PO',
      docNumber: 'HP-PO-104386',
      poNumber: 'HP-PO-104386',
      mimeType: 'application/pdf',
      pages: 1,
      uploadedAt: '2026-10-18T10:00:00Z',
    },
    {
      id: 'd2',
      status: 'MATCHED',
      type: 'INVOICE',
      docNumber: '19789',
      poNumber: 'HP-PO-104386',
      mimeType: 'application/pdf',
      pages: 1,
      uploadedAt: '2026-10-18T10:00:00Z',
    },
  ],
  match: {
    version: 1,
    matchedAt: '2026-10-18T10:00:00Z',
    lineMatches: [
      {
        po: 'd1:1',
        rr: null,
        invoice: 'd2:1',
        method: 'SKU',
        confidence: null,
        reason: null,
        lines: {
          po: line('Kettle Chips, 5 oz', 8, '28.57'),
          rr: null,
          invoice: line('Kettle Chips, 5 oz', 8, '32.35'),
        },
      },
      {
        po: 'd1:2',
        rr: null,
        invoice: 'd2:2',
        method: 'FUZZY_LLM',
        confidence: '0.9500',
        reason:
          'AI: Chunky Nut Spread is the vendor name for Crunchy Almond Butter; same 12 oz size',
        lines: {
          po: line('Crunchy Almond Butter, 12 oz', 5, '5.00'),
          rr: line('Crunchy Almond Butter, 12 oz', 5, null),
          invoice: line('Chunky Nut Spread, Almond, 12 oz', 5, '5.00', null),
        },
      },
    ],
    exceptions: [exception(1, { poNumber: 'HP-PO-104386', amount: '45.36' })],
  },
};
