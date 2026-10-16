/** Dates are plain ISO strings (YYYY-MM-DD) computed in UTC; no wall clock (ADR-0006). */

export const EPOCH = '2026-01-05';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export type DateFormat = 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD-MMM-YYYY' | 'MMMM D, YYYY';

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDate(iso: string, format: DateFormat): string {
  const [y, m, d] = iso.split('-') as [string, string, string];
  const month = MONTHS[Number(m) - 1]!;
  switch (format) {
    case 'MM/DD/YYYY':
      return `${m}/${d}/${y}`;
    case 'YYYY-MM-DD':
      return iso;
    case 'DD-MMM-YYYY':
      return `${d}-${month.slice(0, 3).toUpperCase()}-${y}`;
    case 'MMMM D, YYYY':
      return `${month} ${Number(d)}, ${y}`;
  }
}
