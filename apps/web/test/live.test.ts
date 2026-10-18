import { describe, expect, it } from 'vitest';
import { staleKeys } from '../src/lib/live';

describe('live updates refresh the right data (ADR-0013)', () => {
  it('a matched PO refreshes its page, its history, the problem list, and the overview', () => {
    const keys = staleKeys({ kind: 'set', poNumber: 'HP-PO-1', status: 'MATCHED' }).map((k) =>
      k.join('/'),
    );
    expect(keys).toEqual(
      expect.arrayContaining(['set/HP-PO-1', 'history/HP-PO-1', 'exceptions', 'overview']),
    );
  });
  it('a document status change refreshes the upload rows and that document', () => {
    const keys = staleKeys({ kind: 'document', id: 'd1', status: 'READY' }).map((k) => k.join('/'));
    expect(keys).toEqual(expect.arrayContaining(['documents', 'document/d1']));
  });
  it('a decision refreshes the problem and its PO history', () => {
    const keys = staleKeys({
      kind: 'exception',
      id: 'e1',
      poNumber: 'HP-PO-1',
      status: 'APPROVED',
    }).map((k) => k.join('/'));
    expect(keys).toEqual(expect.arrayContaining(['exceptions', 'exception/e1', 'history/HP-PO-1']));
  });
});
