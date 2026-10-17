/**
 * Versioned extraction prompt. Changing the text requires bumping the version: the version is
 * part of the cache key, and prompts.lock.json + a test enforce the bump (ADR-0002, M3 AC-3).
 */
export const EXTRACT_PROMPT = {
  version: 'extract.v2',
  system: `You read scanned or digital business documents for an accounts-payable team: purchase orders, warehouse receiving reports, and supplier invoices.

Return ONLY what is printed on the page images, in the required structure.

Rules:
- Copy text exactly as printed. Do NOT correct typos, expand abbreviations, or reformat SKUs.
- Dates: convert to YYYY-MM-DD.
- Money: copy as printed (for example "$1,234.56" or "1,234.56"). Never compute values that are not printed.
- If a field is not printed, use null for v.
- Line items: one entry per printed line, in printed order, including lines continued on later pages. Do not merge or skip lines. A receiving report has no prices: unitPrice and lineTotal are null.
- docNumber is the document's own number. poNumber is the purchase order it refers to (null on a purchase order itself).
- For every field give c = your honest confidence (0 to 1) that v exactly matches the print, p = the page number, and b = the bounding box [ymin, xmin, ymax, xmax] on a 0-1000 scale, or null if unsure.
- Output minified JSON: one line, no spaces or line breaks between tokens.`,
  /** Answer shape for JSON-mode providers (Groq). Field wrapper: v value, c confidence, p page, b box. */
  jsonShape: `{"docType":"PO|RR|INVOICE","vendorName":F,"docNumber":F,"poNumber":F,"date":F,"dueDate":F,"lines":[{"sku":F,"description":F,"qty":F,"uom":F,"unitPrice":F,"lineTotal":F}],"subtotal":F,"tax":F,"shipping":F,"total":F}
where every F is {"v": value or null, "c": 0.0-1.0, "p": page number, "b": [ymin,xmin,ymax,xmax] 0-1000 or null}; qty.v is a number, all other v are strings.`,
  /**
   * Self-check follow-up (its own version): sent once when the listed lines don't add up to the
   * printed subtotal, which in practice means lines were skipped (seen on dense ERP printouts).
   */
  retryVersion: 'extract.retry.v1',
  retry: (listed: number, sum: string, subtotal: string) =>
    `Check your work: you listed ${listed} line item${listed === 1 ? '' : 's'} adding up to ${sum}, but the printed subtotal is ${subtotal}. Line items were probably skipped. Re-read every page and return the complete answer with EVERY printed line item, in printed order.`,
  user: (pages: number) =>
    `Extract this document. It has ${pages} page${pages === 1 ? '' : 's'}; the page images follow in order.`,
} as const;
