import { describe, expect, it } from 'vitest';
import { Cents, Decimal, toCents, UnitPrice } from './money.ts';

describe('money (ADR-0004)', () => {
  it('avoids float error', () => {
    expect(toCents(new Decimal('0.1').plus('0.2'))).toBe('0.30');
  });
  it('rounds half-up to cents', () => {
    expect(toCents('12.345')).toBe('12.35');
    expect(toCents('-1.005')).toBe('-1.01');
  });
  it('validates amount strings', () => {
    expect(Cents.safeParse('10.00').success).toBe(true);
    expect(Cents.safeParse('10.0').success).toBe(false);
    expect(UnitPrice.safeParse('0.0425').success).toBe(true);
    expect(UnitPrice.safeParse('4.85').success).toBe(true);
    expect(UnitPrice.safeParse('4.8').success).toBe(false);
  });
});
