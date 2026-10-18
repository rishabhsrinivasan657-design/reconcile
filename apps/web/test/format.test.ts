import { describe, expect, it } from 'vitest';
import { difference, money, parts, unitPrice, when } from '../src/lib/format';

describe('money on screen (style guide: Numbers and money)', () => {
  it('formats exact decimal strings with separators and two decimals', () => {
    expect(money('1284.5')).toBe('$1,284.50');
    expect(money('0')).toBe('$0.00');
    expect(money('1234567.891')).toBe('$1,234,567.89');
    expect(money('-3')).toBe('−$3.00');
    expect(money(null)).toBe('—');
  });
  it('splits headline figures so the cents can be set smaller', () => {
    expect(parts('49286.39')).toEqual({ sign: '', whole: '49,286', cents: '39' });
  });
  it('keeps up to four decimals on unit prices', () => {
    expect(unitPrice('4.8')).toBe('$4.80');
    expect(unitPrice('0.0425')).toBe('$0.0425');
    expect(unitPrice('31.7500')).toBe('$31.75');
  });
  it('computes differences exactly, without floating-point drift', () => {
    expect(difference('48.20', '52.10')).toBe('+$3.90');
    expect(difference('0.30', '0.10')).toBe('−$0.20');
    expect(difference('28.57', '32.35')).toBe('+$3.78');
  });
  it('says when, relative to today', () => {
    const now = new Date('2026-10-18T15:00:00');
    expect(when('2026-10-18T09:41:00', now)).toMatch(/9:41/);
    expect(when('2026-10-17T09:41:00', now)).toBe('Yesterday');
    expect(when('2026-03-04T09:41:00', now)).toBe('Mar 4, 2026');
  });
});
