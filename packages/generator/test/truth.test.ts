import { describe, expect, it } from 'vitest';
import { lineImpacts } from '../src/truth.ts';

/** Every row of the M1 design §6.5 / PRD FR-09 table (M1 AC-13). */
describe('lineImpacts: count each billed unit once', () => {
  const same = '5.00';

  it('clean line raises nothing', () => {
    expect(lineImpacts(10, 10, 10, same, same)).toEqual([]);
  });

  it('short-ship billed in full: SHORT_SHIP carries the over-billing', () => {
    expect(lineImpacts(10, 8, 10, same, same)).toEqual([
      { type: 'SHORT_SHIP', amount: '10.00', informational: false },
    ]);
  });

  it('short-ship billed correctly: informational, $0', () => {
    expect(lineImpacts(10, 8, 8, same, same)).toEqual([
      { type: 'SHORT_SHIP', amount: '0.00', informational: true },
    ]);
  });

  it('over-ship billed for everything received: paying for unordered goods', () => {
    expect(lineImpacts(10, 12, 12, same, same)).toEqual([
      { type: 'OVER_SHIP', amount: '10.00', informational: false },
    ]);
  });

  it('over-ship billed only for what was ordered: informational', () => {
    expect(lineImpacts(10, 12, 10, same, same)).toEqual([
      { type: 'OVER_SHIP', amount: '0.00', informational: true },
    ]);
  });

  it('billed but not received (received in full)', () => {
    expect(lineImpacts(10, 10, 13, same, same)).toEqual([
      { type: 'QTY_BILLED_NOT_RECEIVED', amount: '15.00', informational: false },
    ]);
  });

  it('over-ship and billed beyond received: ranges never overlap', () => {
    // ordered 10, received 12, billed 15 → 2 unordered units paid + 3 billed-not-received.
    expect(lineImpacts(10, 12, 15, same, same)).toEqual([
      { type: 'OVER_SHIP', amount: '10.00', informational: false },
      { type: 'QTY_BILLED_NOT_RECEIVED', amount: '15.00', informational: false },
    ]);
  });

  it('price variance applies only to received units; undercharge is negative', () => {
    expect(lineImpacts(10, 10, 10, '4.80', '5.00')).toEqual([
      { type: 'PRICE_VARIANCE', amount: '2.00', informational: false },
    ]);
    expect(lineImpacts(10, 10, 10, '5.00', '4.50')).toEqual([
      { type: 'PRICE_VARIANCE', amount: '-5.00', informational: false },
    ]);
  });

  it('worked example: ordered 10, received 8, billed 10 at $5.00 vs PO $4.80 = $11.60', () => {
    const impacts = lineImpacts(10, 8, 10, '4.80', '5.00');
    expect(impacts).toEqual([
      { type: 'SHORT_SHIP', amount: '10.00', informational: false },
      { type: 'PRICE_VARIANCE', amount: '1.60', informational: false },
    ]);
    const total = impacts.reduce((s, i) => s + Number(i.amount), 0);
    expect(total.toFixed(2)).toBe('11.60');
  });
});
