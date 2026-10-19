'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/Providers';
import { ErrorState, SkeletonRows } from '@/components/States';
import { Tag } from '@/components/Tag';
import { api, unwrap, type DocumentDetail } from '@/lib/api';
import { boxStyle, fieldRows, type FieldRow } from '@/lib/fields';
import { money, unitPrice } from '@/lib/format';
import { useKeys } from '@/lib/keys';
import { DOC_STATUS, docTypeWords } from '@/lib/words';
import s from './document.module.css';

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({
    queryKey: ['document', id],
    queryFn: () => unwrap(api.GET('/documents/{id}', { params: { path: { id } } })),
  });
  if (q.isPending)
    return (
      <div className="panel">
        <SkeletonRows label="Loading the document" />
      </div>
    );
  if (q.isError)
    return (
      <div className="panel">
        <ErrorState error={q.error} retry={() => q.refetch()} />
      </div>
    );
  return <Viewer doc={q.data} />;
}

function Viewer({ doc }: { doc: DocumentDetail }) {
  const ui = useUi();
  const client = useQueryClient();
  const ex = doc.extraction;
  const rows = useMemo(() => (ex ? fieldRows(ex.fields, ex.confidence, ex.locations) : []), [ex]);
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // After a correction: which match version we're waiting to be replaced (AC-2).
  const [rematch, setRematch] = useState<{ from: number | null; warnings: string[] } | null>(null);
  const set = useQuery({
    queryKey: ['set', doc.poNumber ?? ''],
    queryFn: () =>
      unwrap(api.GET('/sets/{poNumber}', { params: { path: { poNumber: doc.poNumber! } } })),
    enabled: Boolean(doc.poNumber),
  });
  const matchVersion = set.data?.match?.version ?? null;
  const rematched = rematch !== null && matchVersion !== null && matchVersion !== rematch.from;

  const correct = useMutation({
    mutationFn: (fields: Record<string, string>) =>
      unwrap(
        api.POST('/documents/{id}/corrections', {
          params: { path: { id: doc.id } },
          body: { fields },
        }),
      ),
    onSuccess: (r) => {
      setEditing(null);
      setRematch({ from: matchVersion, warnings: r.warnings });
      void client.invalidateQueries({ queryKey: ['document', doc.id] });
    },
    onError: (e) => {
      if (ui.handleLocked(e))
        return ui.toast('Changes are locked on this demo. Unlock them, then save again.');
      ui.toast(e instanceof Error ? e.message : 'The correction wasn’t saved.');
    },
  });

  useKeys({
    e: () => {
      const target = active ?? rows.find((r) => r.unsure)?.key;
      if (target) setEditing(target);
    },
  });

  const pages = doc.pages ?? 1;
  const st = DOC_STATUS[doc.status]!;
  const unsure = rows.filter((r) => r.unsure);
  const groups: [string, FieldRow[]][] = [
    [
      'Details',
      rows.filter(
        (r) =>
          !r.key.startsWith('lines.') && !['subtotal', 'tax', 'shipping', 'total'].includes(r.key),
      ),
    ],
    ...groupLines(rows),
    ['Totals', rows.filter((r) => ['subtotal', 'tax', 'shipping', 'total'].includes(r.key))],
  ];
  const llmSeconds = doc.llm.latencyMs
    ? `${(doc.llm.latencyMs / 1000).toFixed(1)} s`
    : 'saved answer';

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">
            {doc.poNumber ? (
              <Link className="link-btn" href={`/pos/${doc.poNumber}`}>
                <Icon name="back" size={14} /> {doc.poNumber}
              </Link>
            ) : (
              'Not linked to a PO yet'
            )}
          </p>
          <h1>
            {docTypeWords(doc.type)}{' '}
            <span className="mono" style={{ fontSize: 24 }}>
              {doc.docNumber}
            </span>
          </h1>
        </div>
        <div className="row">
          <Tag tone={st.tone}>{st.label}</Tag>
          {ex && (
            <span className="faint small">
              {ex.source === 'HUMAN'
                ? `Corrected by hand · version ${ex.version}`
                : `Read by ${ex.model ?? 'AI'}`}{' '}
              · {llmSeconds}
              {doc.llm.costUsd !== null && ` · $${Number(doc.llm.costUsd).toFixed(4)}`}
            </span>
          )}
          <a
            className="btn btn-ghost small"
            href={`/api/documents/${doc.id}/file`}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="file" /> Original
          </a>
        </div>
      </div>
      <div className={s.layout}>
        <div className={s.viewer}>
          <div className={s.page}>
            <img
              src={`/api/documents/${doc.id}/pages/${page}`}
              alt={`Page ${page} of ${docTypeWords(doc.type).toLowerCase()} ${doc.docNumber ?? ''}`}
              width={1275}
              height={1650}
            />
            {rows
              .filter((r) => r.box && r.page === page)
              .map((r) => (
                <span
                  key={r.key}
                  className={`${s.box} ${r.unsure ? s.unsure : ''} ${active === r.key ? s.on : ''}`}
                  style={boxStyle(r.box!)}
                  aria-hidden="true"
                />
              ))}
          </div>
          {pages > 1 && (
            <div className={s.pages} role="group" aria-label="Pages">
              {Array.from({ length: pages }, (_, i) => (
                <button
                  key={i}
                  className="btn"
                  aria-pressed={page === i + 1}
                  onClick={() => setPage(i + 1)}
                >
                  Page {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="stack">
          {rematch ? (
            <div className={`${s.banner} ${s.info}`} role="status">
              <Icon name={rematched ? 'check' : 'refresh'} />
              <div>
                {rematched
                  ? `Re-matched ${doc.poNumber} (version ${matchVersion}). The problem list is up to date.`
                  : `Saved your correction as a new version (the AI’s is kept). Re-matching ${doc.poNumber ?? 'the PO'}…`}
                {rematch.warnings.length > 0 && (
                  <ul className={s.reasons}>
                    {rematch.warnings.map((w) => (
                      <li key={w}>Still doesn’t add up: {w}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            ex &&
            ex.reviewReasons.length > 0 && (
              <div className={`${s.banner} ${s.caution}`}>
                <Icon name="flag" />
                <div>
                  {ex.needsReview
                    ? `${unsure.length ? `${unsure.length} field${unsure.length === 1 ? '' : 's'} need a look. ` : ''}Why this document was flagged:`
                    : 'Checked by hand. The math still doesn’t add up:'}
                  <ul className={s.reasons}>
                    {ex.reviewReasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          )}
          {!ex ? (
            <div className="panel">
              <SkeletonRows rows={3} label="Waiting for the AI to read this document" />
            </div>
          ) : (
            <section className={`panel ${s.fields}`} aria-labelledby="fields-h">
              <div className="panel-head" style={{ paddingBottom: 12 }}>
                <h2 id="fields-h">What the AI read</h2>
                <span className="faint tiny">Hover or focus a field to find it · E to edit</span>
              </div>
              {groups
                .filter(([, g]) => g.length)
                .map(([title, g]) => (
                  <div key={title} role="group" aria-label={title}>
                    <div className={s.group}>{title}</div>
                    {g.map((r) => (
                      <Field
                        key={r.key}
                        row={r}
                        active={active === r.key}
                        editing={editing === r.key}
                        saving={correct.isPending}
                        onActive={(on) => setActive(on ? r.key : null)}
                        onEdit={() => {
                          if (r.page !== page) setPage(r.page);
                          setEditing(r.key);
                        }}
                        onCancel={() => setEditing(null)}
                        onSave={(v) =>
                          v === r.value ? setEditing(null) : correct.mutate({ [r.key]: v })
                        }
                      />
                    ))}
                  </div>
                ))}
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function groupLines(rows: FieldRow[]): [string, FieldRow[]][] {
  const byLine = new Map<number, FieldRow[]>();
  for (const r of rows) {
    const m = /^lines\.(\d+)\./.exec(r.key);
    if (m) byLine.set(Number(m[1]), [...(byLine.get(Number(m[1])) ?? []), r]);
  }
  return [...byLine.entries()].map(([i, g]) => [`Line ${i + 1}`, g]);
}

function Field({
  row,
  active,
  editing,
  saving,
  onActive,
  onEdit,
  onCancel,
  onSave,
}: {
  row: FieldRow;
  active: boolean;
  editing: boolean;
  saving: boolean;
  onActive: (on: boolean) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(row.value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) {
      setValue(row.value);
      requestAnimationFrame(() => input.current?.select());
    }
  }, [editing, row.value]);
  const shown = row.money
    ? /unitPrice$/.test(row.key)
      ? unitPrice(row.value)
      : money(row.value)
    : row.value;
  const mono = /docNumber|poNumber|\.sku$/.test(row.key);
  return (
    <div
      className={`${s.row} ${row.unsure ? s.unsure : ''} ${active ? s.on : ''}`}
      tabIndex={editing ? -1 : 0}
      onMouseEnter={() => onActive(true)}
      onMouseLeave={() => onActive(false)}
      onFocus={() => onActive(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onActive(false);
      }}
      onKeyDown={(e) => {
        if (!editing && e.key === 'Enter') onEdit();
      }}
      aria-label={`${row.label}: ${shown}${row.unsure ? ', unsure' : ''}`}
    >
      <span className={s.label}>{row.label}</span>
      {editing ? (
        <form
          className={s.edit}
          onSubmit={(e) => {
            e.preventDefault();
            onSave(value.trim());
          }}
        >
          <label className="sr-only" htmlFor={`edit-${row.key}`}>
            Correct {row.label}
          </label>
          <input
            id={`edit-${row.key}`}
            ref={input}
            type="text"
            value={value}
            disabled={saving}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onCancel()}
          />
        </form>
      ) : (
        <span className={`${s.value} ${mono ? 'mono' : ''}`}>{shown}</span>
      )}
      <span className={s.conf}>
        {row.confidence !== null && (
          <>
            <span className={s.meter} aria-hidden="true">
              <b style={{ width: `${Math.round(row.confidence * 100)}%` }} />
            </span>
            {Math.round(row.confidence * 100)}%
          </>
        )}
        {row.unsure && <Icon name="flag" size={12} label="Unsure" />}
      </span>
      {editing ? (
        <button
          className={s.iconBtn}
          type="button"
          onClick={onCancel}
          aria-label={`Cancel editing ${row.label}`}
        >
          <Icon name="x" />
        </button>
      ) : (
        <button
          className={s.iconBtn}
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${row.label}`}
        >
          <Icon name="edit" />
        </button>
      )}
    </div>
  );
}
