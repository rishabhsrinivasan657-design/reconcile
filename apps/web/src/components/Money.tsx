import { parts } from '@/lib/format';

/** A headline figure in Newsreader with smaller, quieter cents (style guide: Numbers and money). */
export function BigMoney({ amount, size = 56 }: { amount: string; size?: number }) {
  const { sign, whole, cents } = parts(amount);
  return (
    <span style={{ font: `500 ${size}px/1 var(--serif)`, letterSpacing: '-0.02em' }}>
      {sign}${whole}
      <span style={{ fontSize: size / 2, color: 'var(--ink-2)' }}>.{cents}</span>
    </span>
  );
}
