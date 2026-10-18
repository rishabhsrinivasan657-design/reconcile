'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { ErrorState, SkeletonRows } from '@/components/States';
import { Tag } from '@/components/Tag';
import { Timeline } from '@/components/Timeline';
import { api, unwrap, type SetDetail } from '@/lib/api';
import { date, money, unitPrice } from '@/lib/format';
import {
  DOC_STATUS,
  EXCEPTION_STATUS,
  METHOD,
  SET_STATUS,
  docTypeWords,
  pairingReason,
  problemWords,
} from '@/lib/words';
import s from './po.module.css';

export default function PoPage() {
  const po = decodeURIComponent(useParams<{ po: string }>().po);
  const set = useQuery({
    queryKey: ['set', po],
    queryFn: () => unwrap(api.GET('/sets/{poNumber}', { params: { path: { poNumber: po } } })),
  });
  const history = useQuery({
    queryKey: ['history', po],
    queryFn: () =>
      unwrap(api.GET('/sets/{poNumber}/history', { params: { path: { poNumber: po } } })),
  });
  if (set.isPending)
    return (
      <div className="panel">
        <SkeletonRows label="Loading the purchase order" />
      </div>
    );
  if (set.isError)
    return (
      <div className="panel">
        <ErrorState error={set.error} retry={() => set.refetch()} />
      </div>
    );
  const d = set.data;
  const st = SET_STATUS[d.status]!;
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <Link className="link-btn" href="/pos">
              <Icon name="back" size={14} /> Purchase orders
            </Link>
            {d.vendorName ? ` · ${d.vendorName}` : ''}
          </p>
          <h1 className="mono" style={{ fontFamily: 'var(--mono)', fontSize: 26 }}>
            {d.poNumber}
          </h1>
        </div>
        <div className="row">
          <Tag tone={st.tone}>
            {d.provisional && d.status === 'NEEDS_REVIEW' ? 'Matched, needs review' : st.label}
          </Tag>
          {d.match && <Tag tone="neutral">Match version {d.match.version}</Tag>}
        </div>
      </div>
      <div className={s.layout}>
        <div className="stack">
          <section className="panel" aria-labelledby="docs-h">
            <div className="panel-head">
              <h2 id="docs-h">Documents</h2>
              {d.waitingUntil && (
                <span className="muted small">
                  Waiting for the rest until {date(d.waitingUntil)}
                </span>
              )}
            </div>
            <div className={s.docs}>
              {d.documents.map((doc) => {
                const ds = DOC_STATUS[doc.status]!;
                return (
                  <Link key={doc.id} className={s.doc} href={`/documents/${doc.id}`}>
                    <span className="muted tiny">{docTypeWords(doc.type)}</span>
                    <span className="mono">{doc.docNumber ?? 'Not read yet'}</span>
                    <span>
                      <Tag tone={ds.tone}>{ds.label}</Tag>
                    </span>
                  </Link>
                );
              })}
            </div>
            {d.groupedInto && (
              <div className={s.note}>
                <Icon name="flag" />
                <span>
                  This PO number looked misread, so its documents were matched with{' '}
                  <Link className="mono" href={`/pos/${d.groupedInto}`}>
                    {d.groupedInto}
                  </Link>
                  .
                </span>
              </div>
            )}
            {d.notes.map((n) => (
              <div className={s.note} key={n}>
                <Icon name="flag" /> {n}
              </div>
            ))}
          </section>
          <Problems d={d} />
          {d.match && d.match.lineMatches.length > 0 && <Lines d={d} />}
        </div>
        <section className={`panel ${s.history}`} aria-labelledby="history-h">
          <div className="panel-head">
            <h2 id="history-h">History</h2>
          </div>
          {history.isPending ? (
            <SkeletonRows rows={4} label="Loading history" />
          ) : history.isError ? (
            <ErrorState error={history.error} retry={() => history.refetch()} />
          ) : (
            <Timeline entries={history.data} />
          )}
        </section>
      </div>
    </>
  );
}

function Problems({ d }: { d: SetDetail }) {
  const list = d.match?.exceptions ?? [];
  return (
    <section className="panel" aria-labelledby="problems-h">
      <div className="panel-head">
        <h2 id="problems-h">Problems</h2>
        <span className="faint small">
          {list.length === 0 ? 'None' : `${d.openExceptions} open`}
        </span>
      </div>
      {list.length === 0 ? (
        <p className="muted" style={{ margin: 0, padding: '0 16px 16px' }}>
          {d.match ? 'Everything on this PO matches.' : 'Not matched yet.'}
        </p>
      ) : (
        list.map((e) => {
          const w = problemWords(e.type);
          const es = EXCEPTION_STATUS[e.status]!;
          return (
            <Link
              key={e.id}
              className={s.problem}
              href={`/problems?id=${e.id}${e.status === 'OPEN' ? '' : '&show=decided'}`}
            >
              <span className="row">
                <Tag tone={e.informational ? 'neutral' : w.tone}>{w.label}</Tag>
                <Tag tone={es.tone} icon={null}>
                  {es.label}
                </Tag>
              </span>
              <b>{money(e.amount)}</b>
              <p>{e.explanation}</p>
            </Link>
          );
        })
      )}
    </section>
  );
}

function Lines({ d }: { d: SetDetail }) {
  const rows = d.match!.lineMatches;
  return (
    <section className="panel" aria-labelledby="lines-h">
      <div className="panel-head">
        <h2 id="lines-h">How the lines were matched</h2>
        <span className="faint small">{rows.length} lines</span>
      </div>
      <div className="table-wrap">
        <table className="ledger">
          <thead>
            <tr>
              <th scope="col">Line</th>
              <th scope="col">Matched by</th>
              <th scope="col" className="right">
                Ordered
              </th>
              <th scope="col" className="right">
                Received
              </th>
              <th scope="col" className="right">
                Billed
              </th>
              <th scope="col" className="right">
                PO price
              </th>
              <th scope="col" className="right">
                Invoice price
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => {
              const { po, rr, invoice } = m.lines;
              const reason = pairingReason(m.reason);
              const method = reason?.ai
                ? { label: 'AI', tone: 'accent' as const }
                : (METHOD[m.method] ?? METHOD.SKU!);
              const plain = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '');
              const sameText =
                po && invoice && plain(po.description) === plain(invoice.description);
              return (
                <tr key={i}>
                  <td>
                    {po ? po.description : <span className="faint">Not on the PO</span>}
                    {po?.sku && <div className="mono faint">{po.sku}</div>}
                    {invoice && !sameText && (
                      <div className="muted small">
                        {po ? 'Invoice says: ' : 'Invoice: '}
                        {invoice.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <Tag tone={method.tone} icon={reason?.ai ? 'spark' : null}>
                      {method.label}
                    </Tag>
                    {reason && m.method !== 'SKU' && <div className={s.reason}>{reason.text}</div>}
                  </td>
                  <td className="right">{po?.qty ?? '—'}</td>
                  <td className="right">{rr?.qty ?? '—'}</td>
                  <td className="right">{invoice?.qty ?? '—'}</td>
                  <td className="right">{unitPrice(po?.unitPrice)}</td>
                  <td className="right">{unitPrice(invoice?.unitPrice)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
