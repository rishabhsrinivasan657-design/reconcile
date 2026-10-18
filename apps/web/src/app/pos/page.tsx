'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Empty, ErrorState, SkeletonRows } from '@/components/States';
import { Tag } from '@/components/Tag';
import { api, unwrap } from '@/lib/api';
import { date, money } from '@/lib/format';
import { SET_STATUS } from '@/lib/words';

const FILTERS = [
  ['all', 'All'],
  ['NEEDS_REVIEW', 'Needs review'],
  ['WAITING', 'Waiting'],
  ['MATCHED', 'Matched'],
] as const;

export default function PosPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');
  const q = useQuery({ queryKey: ['sets'], queryFn: () => unwrap(api.GET('/sets')) });
  const rows = useMemo(
    () =>
      (q.data ?? [])
        .filter((s) => filter === 'all' || s.status === filter)
        .sort(
          (a, b) =>
            Number(b.moneyAtRisk) - Number(a.moneyAtRisk) || b.updatedAt.localeCompare(a.updatedAt),
        ),
    [q.data, filter],
  );
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Every purchase order and the documents that belong to it</p>
          <h1>Purchase orders</h1>
        </div>
        <div className="row" role="group" aria-label="Filter by status">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              className="btn"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
              {q.data && key !== 'all' && (
                <span className="faint">{q.data.filter((s) => s.status === key).length}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="panel">
        {q.isPending ? (
          <SkeletonRows label="Loading purchase orders" />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : q.data.length === 0 ? (
          <Empty
            title="No purchase orders yet"
            action={
              <Link className="btn btn-primary" href="/upload">
                Upload documents
              </Link>
            }
          >
            Purchase orders appear here as soon as one of their documents is read.
          </Empty>
        ) : rows.length === 0 ? (
          <Empty title="None with this status">Pick another filter to see the rest.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th scope="col">PO</th>
                  <th scope="col">Vendor</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="right">
                    Documents
                  </th>
                  <th scope="col" className="right">
                    Open problems
                  </th>
                  <th scope="col" className="right">
                    At risk
                  </th>
                  <th scope="col">Last change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const st = SET_STATUS[s.status]!;
                  return (
                    <tr
                      key={s.poNumber}
                      className="clickable"
                      onClick={() => router.push(`/pos/${s.poNumber}`)}
                    >
                      <td>
                        <Link
                          className="mono"
                          href={`/pos/${s.poNumber}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {s.poNumber}
                        </Link>
                      </td>
                      <td>{s.vendorName ?? <span className="faint">Unknown</span>}</td>
                      <td>
                        <span className="row">
                          <Tag tone={st.tone}>{st.label}</Tag>
                          {s.provisional && s.status !== 'NEEDS_REVIEW' && (
                            <Tag tone="caution">Provisional</Tag>
                          )}
                        </span>
                      </td>
                      <td className="right">{s.documents}</td>
                      <td className="right">
                        {s.openExceptions || <span className="faint">0</span>}
                      </td>
                      <td className="right">
                        {Number(s.moneyAtRisk) > 0 ? (
                          money(s.moneyAtRisk)
                        ) : (
                          <span className="faint">—</span>
                        )}
                      </td>
                      <td className="faint">{date(s.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
