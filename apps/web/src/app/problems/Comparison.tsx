import type { ComparisonRow, Line } from '@/lib/api';
import { difference, money, unitPrice } from '@/lib/format';
import s from './problems.module.css';

const SIDES = [
  ['po', 'Purchase order'],
  ['rr', 'Receiving report'],
  ['invoice', 'Invoice'],
] as const;

/**
 * The involved lines from the PO, the receipt, and the invoice next to each other, with the
 * values that differ emphasized and the difference written underneath (M5 AC-5).
 */
export function Comparison({ rows }: { rows: ComparisonRow[] }) {
  return (
    <div className={s.compareWrap}>
      {rows.map((row, i) => (
        <div className={s.compare} key={i} role="group" aria-label={`Line comparison ${i + 1}`}>
          {SIDES.map(([side, title]) => (
            <Column key={side} title={title} line={row[side]} side={side} row={row} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Column({
  title,
  line,
  side,
  row,
}: {
  title: string;
  line: Line | null;
  side: 'po' | 'rr' | 'invoice';
  row: ComparisonRow;
}) {
  if (!line)
    return (
      <div className={s.col}>
        <h3>{title}</h3>
        <span className={s.none}>
          {side === 'po' ? 'Not on the PO' : side === 'rr' ? 'Not received' : 'Not billed'}
        </span>
      </div>
    );
  const po = row.po;
  const qtyDiff = side !== 'po' && po !== null && line.qty !== po.qty;
  const priceDiff =
    side === 'invoice' &&
    po?.unitPrice &&
    line.unitPrice &&
    Number(line.unitPrice) !== Number(po.unitPrice);
  const qtyLabel = side === 'rr' ? 'Received' : side === 'invoice' ? 'Billed' : 'Ordered';
  return (
    <div className={s.col}>
      <h3>
        {title} · line {line.lineNo}
      </h3>
      <span className="mono">{line.sku ?? 'No SKU'}</span>
      <div className={s.kv}>
        <span>Item</span>
        <span>{line.description}</span>
      </div>
      <div className={`${s.kv} ${qtyDiff ? s.diff : ''}`}>
        <span>{qtyLabel}</span>
        <span>
          {line.qty} {line.uom}
        </span>
      </div>
      {side !== 'rr' && (
        <div className={`${s.kv} ${priceDiff ? s.diff : ''}`}>
          <span>Unit price</span>
          <span>{unitPrice(line.unitPrice)}</span>
        </div>
      )}
      {side !== 'rr' && line.lineTotal && (
        <div className={s.kv}>
          <span>Line total</span>
          <span>{money(line.lineTotal)}</span>
        </div>
      )}
      {qtyDiff && (
        <span className={s.diffNote}>
          {line.qty - po!.qty > 0 ? '+' : '−'}
          {Math.abs(line.qty - po!.qty)} {line.uom} vs the PO
        </span>
      )}
      {priceDiff && (
        <span className={s.diffNote}>
          {difference(po!.unitPrice!, line.unitPrice!)} / {line.uom.toLowerCase()} vs the PO
        </span>
      )}
    </div>
  );
}
