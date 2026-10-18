'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/Providers';
import { Empty, ErrorState, SkeletonRows } from '@/components/States';
import { Tag } from '@/components/Tag';
import { api, unwrap, type DecisionAction, type ExceptionItem } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { useKeys } from '@/lib/keys';
import { DECISION, EXCEPTION_STATUS, docTypeWords, pairingReason, problemWords } from '@/lib/words';
import { Comparison } from './Comparison';
import s from './problems.module.css';

const LIST_KEY = ['exceptions', 'impact'] as const;

export default function ProblemsPage() {
  return (
    <Suspense
      fallback={
        <div className="panel">
          <SkeletonRows label="Loading problems" />
        </div>
      }
    >
      <Problems />
    </Suspense>
  );
}

function Problems() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const show = params.get('show') === 'decided' ? 'decided' : 'open';
  const type = params.get('type');
  const list = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => unwrap(api.GET('/exceptions', { params: { query: { sort: 'impact' } } })),
  });
  const items = useMemo(
    () =>
      (list.data ?? []).filter(
        (e) =>
          (show === 'open' ? e.status === 'OPEN' : e.status !== 'OPEN') &&
          (!type || e.type === type),
      ),
    [list.data, show, type],
  );
  const setQuery = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    router.replace(`${path}?${q}`, { scroll: false });
  };
  // Selection lives in state (instant for J/K); the address bar follows so links can be shared.
  const [picked, setPicked] = useState<string | null>(params.get('id'));
  const selectedId = picked && items.some((e) => e.id === picked) ? picked : items[0]?.id;
  const select = (id: string | undefined) => {
    if (!id) return;
    setPicked(id);
    setQuery({ id });
  };
  const idx = items.findIndex((e) => e.id === selectedId);
  useKeys({
    j: () => select(items[Math.min(items.length - 1, idx + 1)]?.id),
    k: () => select(items[Math.max(0, idx - 1)]?.id),
  });
  const open = items.filter((e) => !e.informational).length;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Largest money at risk first</p>
          <h1>Problems</h1>
        </div>
        <div className={s.filters}>
          {type && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setPicked(null);
                setQuery({ type: null, id: null });
              }}
            >
              {problemWords(type).label} <Icon name="x" label="Clear filter" />
            </button>
          )}
          <span className="faint small">
            <span className="kbd">J</span> <span className="kbd">K</span> to move
          </span>
          <button
            className="btn"
            aria-pressed={show === 'decided'}
            onClick={() => {
              setPicked(null);
              setQuery({ show: show === 'decided' ? null : 'decided', id: null });
            }}
          >
            {show === 'decided' ? 'Showing decided' : 'Show decided'}
          </button>
        </div>
      </div>
      {list.isPending ? (
        <div className="panel">
          <SkeletonRows label="Loading problems" />
        </div>
      ) : list.isError ? (
        <div className="panel">
          <ErrorState error={list.error} retry={() => list.refetch()} />
        </div>
      ) : items.length === 0 ? (
        <div className="panel">
          {show === 'open' ? (
            <Empty
              title="No open problems"
              action={
                <Link className="btn" href="/upload">
                  Upload documents
                </Link>
              }
            >
              Everything is matched or decided. New problems show up here as documents arrive.
            </Empty>
          ) : (
            <Empty title="Nothing decided yet">
              Your approvals, disputes, and write-offs will be listed here.
            </Empty>
          )}
        </div>
      ) : (
        <div className={s.split}>
          <nav
            className={`panel ${s.list}`}
            aria-label={show === 'open' ? 'Open problems' : 'Decided problems'}
          >
            <div className={s.listHead}>
              <h3>
                {show === 'open'
                  ? `${open} open${items.length > open ? ` · ${items.length - open} for your records` : ''}`
                  : `${items.length} decided`}
              </h3>
              <h3>Impact</h3>
            </div>
            {items.map((e) => (
              <ListItem
                key={e.id}
                e={e}
                current={e.id === selectedId}
                onSelect={() => select(e.id)}
              />
            ))}
          </nav>
          {selectedId && (
            <Detail
              key={selectedId}
              id={selectedId}
              onDecided={() => {
                const next = items[idx + 1] ?? items[idx - 1];
                if (next && next.id !== selectedId) select(next.id);
              }}
            />
          )}
        </div>
      )}
    </>
  );
}

function ListItem({
  e,
  current,
  onSelect,
}: {
  e: ExceptionItem;
  current: boolean;
  onSelect: () => void;
}) {
  const w = problemWords(e.type);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Keep the selected row visible inside the list, without scrolling the whole page.
    const el = ref.current;
    const list = el?.parentElement;
    if (!current || !el || !list) return;
    const head = 44;
    if (el.offsetTop - head < list.scrollTop) list.scrollTop = el.offsetTop - head;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight;
  }, [current]);
  return (
    <button
      ref={ref}
      className={`${s.item} ${e.informational ? s.info : ''}`}
      aria-current={current}
      onClick={onSelect}
    >
      <span className={s.line1}>
        <Tag tone={e.informational ? 'neutral' : w.tone}>{w.label}</Tag>
        <span className={s.vendor}>{e.vendorName ?? 'Unknown vendor'}</span>
      </span>
      <span className={s.impact}>{money(e.amount)}</span>
      <span className={s.sub}>
        <span className="mono">{e.poNumber}</span> · {e.explanation}
      </span>
    </button>
  );
}

function Detail({ id, onDecided }: { id: string; onDecided: () => void }) {
  const ui = useUi();
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ['exception', id],
    queryFn: () => unwrap(api.GET('/exceptions/{id}', { params: { path: { id } } })),
  });
  const [choice, setChoice] = useState<DecisionAction | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const decide = useMutation({
    mutationFn: (body: { action: DecisionAction; note: string }) =>
      unwrap(api.POST('/exceptions/{id}/decision', { params: { path: { id } }, body })),
    // The problem leaves the open list at once; it comes back if the server says no (AC-1).
    onMutate: async (body) => {
      await client.cancelQueries({ queryKey: LIST_KEY });
      const before = client.getQueryData<ExceptionItem[]>(LIST_KEY);
      client.setQueryData<ExceptionItem[]>(LIST_KEY, (old) =>
        old?.map((e) => (e.id === id ? { ...e, status: STATUS_AFTER[body.action] } : e)),
      );
      onDecided();
      return { before };
    },
    onError: (err, _body, ctx) => {
      if (ctx?.before) client.setQueryData(LIST_KEY, ctx.before);
      ui.toast(err instanceof Error ? err.message : 'The decision wasn’t saved. Try again.');
    },
    onSuccess: (e, body) => {
      ui.toast(
        `${DECISION[body.action]!.past}: ${e.vendorName ?? e.poNumber}, ${money(e.amount)}. Saved to the ${e.poNumber} history.`,
      );
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['exceptions'] });
      void client.invalidateQueries({ queryKey: ['overview'] });
    },
  });

  const pick = (a: DecisionAction) => {
    setChoice(a);
    setError('');
    noteRef.current?.focus();
  };
  const isOpen = q.data?.status === 'OPEN';
  useKeys(
    { a: () => pick('APPROVE'), d: () => pick('DISPUTE'), w: () => pick('WRITE_OFF') },
    isOpen,
  );

  const save = () => {
    if (!choice) return setError('Pick approve, dispute, or write off first.');
    if (!note.trim()) {
      noteRef.current?.focus();
      return setError('Add a note first. It goes in the PO’s history.');
    }
    decide.mutate({ action: choice, note: note.trim() });
  };

  if (q.isPending)
    return (
      <div className={`panel ${s.detail}`}>
        <SkeletonRows rows={4} label="Loading the problem" />
      </div>
    );
  if (q.isError)
    return (
      <div className="panel">
        <ErrorState error={q.error} retry={() => q.refetch()} />
      </div>
    );
  const e = q.data;
  const w = problemWords(e.type);
  return (
    <article className={`panel ${s.detail}`} aria-labelledby="problem-title">
      <div className={s.head}>
        <div className="stack" style={{ gap: 8 }}>
          <div className="row">
            <Tag tone={e.informational ? 'neutral' : w.tone}>{w.label}</Tag>
            {e.status !== 'OPEN' && (
              <Tag tone={EXCEPTION_STATUS[e.status]!.tone}>{EXCEPTION_STATUS[e.status]!.label}</Tag>
            )}
          </div>
          <h2 id="problem-title">{e.vendorName ?? 'Unknown vendor'}</h2>
          <Link className="link-btn mono" href={`/pos/${e.poNumber}`}>
            {e.poNumber}
          </Link>
        </div>
        <div className={`${s.amount} ${e.informational ? s.quiet : ''}`}>
          <h3>{e.informational ? 'No money at risk' : 'At risk'}</h3>
          <b>{money(e.amount)}</b>
        </div>
      </div>
      <p className={s.explain}>{e.explanation}</p>
      {e.comparison.length > 0 && <Comparison rows={e.comparison} />}
      {e.comparison
        .filter((r) => r.method === 'FUZZY_LLM')
        .map((r) => pairingReason(r.reason))
        .filter((r) => r !== null)
        .map((r, i) => (
          <div className={s.ai} key={i}>
            <Icon name={r.ai ? 'spark' : 'check'} />
            <span>{r.text}</span>
          </div>
        ))}
      <div className={s.docs}>
        {e.documents.map((d) => (
          <Link key={d.id} className="btn btn-ghost small" href={`/documents/${d.id}`}>
            <Icon name="file" /> {docTypeWords(d.type)} <span className="mono">{d.docNumber}</span>
          </Link>
        ))}
      </div>
      {isOpen ? (
        <form
          className={s.decide}
          onSubmit={(ev) => {
            ev.preventDefault();
            save();
          }}
        >
          <h3 id="decision-h">Your decision</h3>
          <div className="row" role="group" aria-labelledby="decision-h">
            {(['APPROVE', 'DISPUTE', 'WRITE_OFF'] as const).map((a) => (
              <button
                key={a}
                type="button"
                className="btn"
                aria-pressed={choice === a}
                onClick={() => pick(a)}
              >
                {DECISION[a]!.label} <span className="kbd">{a === 'WRITE_OFF' ? 'W' : a[0]}</span>
              </button>
            ))}
          </div>
          <label htmlFor="note" className="faint small">
            Note (required, saved to the PO’s history)
          </label>
          <textarea
            id="note"
            ref={noteRef}
            value={note}
            placeholder="Called the vendor: they’ll credit the difference on the next invoice."
            onChange={(ev) => {
              setNote(ev.target.value);
              setError('');
            }}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                save();
              }
            }}
            aria-describedby="note-error"
          />
          <div className={s.decideFoot}>
            <span className="field-error" id="note-error" role="alert">
              {error}
            </span>
            <span className="row">
              <span className="faint tiny">Enter to save · Shift+Enter for a new line</span>
              <button className="btn btn-primary" type="submit" aria-busy={decide.isPending}>
                Save decision
              </button>
            </span>
          </div>
        </form>
      ) : (
        <div className={s.decided}>
          <h3>Decision</h3>
          {e.decision ? (
            <>
              <span>
                {DECISION[e.decision.action]!.past} by {e.decision.by.replace(/\s*\(.*\)$/, '')} ·{' '}
                <span className="faint">{dateTime(e.decision.at)}</span>
              </span>
              <q>{e.decision.note}</q>
            </>
          ) : (
            <span className="muted">Carried over from an earlier match of this PO.</span>
          )}
        </div>
      )}
    </article>
  );
}

const STATUS_AFTER: Record<DecisionAction, ExceptionItem['status']> = {
  APPROVE: 'APPROVED',
  DISPUTE: 'DISPUTED',
  WRITE_OFF: 'WRITTEN_OFF',
};
