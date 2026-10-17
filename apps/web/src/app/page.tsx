'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BigMoney } from '@/components/Money';
import { Empty, ErrorState, SkeletonRows } from '@/components/States';
import { Tag } from '@/components/Tag';
import { api, unwrap, type Overview } from '@/lib/api';
import { money, plural, when } from '@/lib/format';
import { problemWords } from '@/lib/words';
import s from './overview.module.css';

function useGreeting(name?: string) {
  const [g, setG] = useState({ eyebrow: '', title: 'Overview' });
  useEffect(() => {
    const now = new Date();
    const h = now.getHours();
    const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const first = name?.split(/\s+/)[0];
    setG({
      eyebrow: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      title: first ? `${part}, ${first}` : part,
    });
  }, [name]);
  return g;
}

export default function OverviewPage() {
  const q = useQuery({ queryKey: ['overview'], queryFn: () => unwrap(api.GET('/overview')) });
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => unwrap(api.GET('/me')),
    staleTime: Infinity,
  });
  const g = useGreeting(me.data?.name);
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow" suppressHydrationWarning>
            {g.eyebrow || ' '}
          </p>
          <h1>{g.title}</h1>
        </div>
      </div>
      {q.isPending ? (
        <div className="panel">
          <SkeletonRows rows={6} label="Loading the overview" />
        </div>
      ) : q.isError ? (
        <div className="panel">
          <ErrorState error={q.error} retry={() => q.refetch()} />
        </div>
      ) : q.data.documents.total === 0 ? (
        <div className="panel">
          <Empty
            title="Start with your documents"
            action={
              <Link className="btn btn-primary" href="/upload">
                Upload documents
              </Link>
            }
          >
            Drop in purchase orders, receiving reports, and invoices. Reconcile reads them, groups
            them by PO, and shows you where money is at risk.
          </Empty>
        </div>
      ) : (
        <Dashboard o={q.data} />
      )}
    </>
  );
}

function Dashboard({ o }: { o: Overview }) {
  const max = Math.max(...o.byType.map((t) => Number(t.amount)), 0);
  return (
    <>
      <div className={s.top}>
        <section className={`panel ${s.risk}`} aria-labelledby="risk-h">
          <h3 id="risk-h">Money at risk</h3>
          <BigMoney amount={o.moneyAtRisk} />
          <div className={s.meta}>
            <div>
              <span className="faint tiny">Open problems</span>
              <b>{o.openProblems}</b>
            </div>
            <div>
              <span className="faint tiny">For your records</span>
              <b>{o.informational}</b>
            </div>
            <div>
              <span className="faint tiny">Decided this week</span>
              <b>{o.decidedThisWeek}</b>
            </div>
          </div>
          <div>
            <Link className="btn btn-primary" href="/problems">
              {o.openProblems ? 'Work the queue' : 'See decided problems'}{' '}
              <span className="kbd">G P</span>
            </Link>
          </div>
        </section>
        <section className={`panel ${s.bars}`} aria-labelledby="bars-h">
          <h3 id="bars-h">Where the money is</h3>
          {o.byType.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>
              Nothing at risk right now.
            </p>
          ) : (
            o.byType.map((t) => (
              <Link key={t.type} className={s.bar} href={`/problems?type=${t.type}`}>
                <span>
                  {problemWords(t.type).label}
                  <span className="faint"> · {t.count}</span>
                </span>
                <span className={s.track} aria-hidden="true">
                  <span
                    className={s.fill}
                    style={{
                      display: 'block',
                      width: `${max ? Math.max(3, (Number(t.amount) / max) * 100) : 0}%`,
                    }}
                  />
                </span>
                <span className="right">{money(t.amount)}</span>
              </Link>
            ))
          )}
        </section>
      </div>
      <div className={s.grid}>
        <section className={`panel ${s.stat}`}>
          <h3>Purchase orders</h3>
          <b>{o.sets.total}</b>
          <div className="row">
            <Tag tone="settled">{o.sets.matched} matched</Tag>
            {o.sets.waiting > 0 && <Tag tone="neutral">{o.sets.waiting} waiting</Tag>}
            {o.sets.needsReview > 0 && <Tag tone="caution">{o.sets.needsReview} need review</Tag>}
          </div>
        </section>
        <section className={`panel ${s.stat}`}>
          <h3>AI cost per document</h3>
          <b>
            {o.ai.costPerDocumentUsd === null
              ? '—'
              : `$${Number(o.ai.costPerDocumentUsd).toFixed(4)}`}
          </b>
          <span className="muted small">
            {plural(o.ai.documentsRead, 'document')} read · {Math.round(o.ai.cachedShare * 100)}%
            from saved answers
          </span>
        </section>
        <section className={`panel ${s.stat}`}>
          <h3>Reading time per document</h3>
          <b>
            {o.ai.medianSecondsPerDocument === null
              ? '—'
              : `${o.ai.medianSecondsPerDocument.toFixed(1)} s`}
          </b>
          <span className="muted small">
            {o.ai.slowestSeconds === null
              ? 'All answers came from the saved copies'
              : `Typical document · slowest ${o.ai.slowestSeconds.toFixed(1)} s`}
          </span>
        </section>
      </div>
      <section className="panel" aria-labelledby="recent-h">
        <div className="panel-head">
          <h2 id="recent-h">Recent activity</h2>
          <Link className="btn btn-ghost" href="/pos">
            All POs
          </Link>
        </div>
        <ul className={s.activity}>
          {o.recent.map((e) => (
            <li key={e.id} className={s.act}>
              <span
                className={`${s.dot} ${e.actor.type === 'USER' ? s.human : ''}`}
                aria-hidden="true"
              />
              <div>
                {e.actor.name && <b>{e.actor.name.replace(/\s*\(.*\)$/, '')}: </b>}
                {e.summary}
                {e.poNumber && (
                  <>
                    {' · '}
                    <Link className="mono" href={`/pos/${e.poNumber}`}>
                      {e.poNumber}
                    </Link>
                  </>
                )}
                {e.note && <div className="muted small">“{e.note}”</div>}
              </div>
              <span className="faint tiny" suppressHydrationWarning>
                {when(e.at)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
