'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Tag } from '@/components/Tag';
import { api, unwrap, type DocumentSummary } from '@/lib/api';
import { when } from '@/lib/format';
import { DOC_STATUS, docTypeWords } from '@/lib/words';
import s from './upload.module.css';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ['application/pdf', 'image/png', 'image/jpeg'];
const STEPS = ['Uploaded', 'Reading', 'Ready', 'Matched'];

interface Sent {
  key: string;
  name: string;
  /** Set once the API has accepted the file. */
  id?: string;
  duplicate?: boolean;
  error?: string;
}

/** Drag in files and watch each move through uploaded → reading → ready → matched, live (AC-3). */
export default function UploadPage() {
  const client = useQueryClient();
  const [sent, setSent] = useState<Sent[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const recent = useQuery({
    queryKey: ['documents', 'recent'],
    queryFn: () => unwrap(api.GET('/documents', { params: { query: { limit: 50 } } })),
  });
  const byId = new Map((recent.data ?? []).map((d) => [d.id, d]));

  const upload = async (files: FileList | File[]) => {
    const list = [...files];
    const rows: Sent[] = list.map((f, i) => ({
      key: `${Date.now()}-${i}-${f.name}`,
      name: f.name,
    }));
    setSent((old) => [...rows, ...old]);
    await Promise.all(
      list.map(async (file, i) => {
        const key = rows[i]!.key;
        const update = (patch: Partial<Sent>) =>
          setSent((old) => old.map((r) => (r.key === key ? { ...r, ...patch } : r)));
        if (file.type && !ACCEPT.includes(file.type))
          return update({ error: 'Only PDF, PNG, or JPEG files can be read.' });
        if (file.size > MAX_BYTES) return update({ error: 'This file is over the 10 MB limit.' });
        const body = new FormData();
        body.append('file', file);
        try {
          const res = await fetch('/api/documents', { method: 'POST', body });
          const json = (await res.json()) as {
            document?: DocumentSummary;
            duplicate?: boolean;
            detail?: string;
          };
          if (!res.ok || !json.document)
            return update({ error: json.detail ?? `The server answered ${res.status}.` });
          update({ id: json.document.id, duplicate: Boolean(json.duplicate) });
        } catch {
          update({ error: 'Couldn’t reach the server. Try again.' });
        }
      }),
    );
    void client.invalidateQueries({ queryKey: ['documents'] });
  };

  const sentIds = new Set(sent.map((r) => r.id).filter(Boolean));
  const earlier = (recent.data ?? []).filter((d) => !sentIds.has(d.id)).slice(0, 12);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">PDF, PNG, or JPEG · up to 10 MB each</p>
          <h1>Upload documents</h1>
        </div>
      </div>
      <div className="stack">
        <div
          className={`${s.drop} ${over ? s.over : ''}`}
          onDragEnter={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
          }}
        >
          <Icon name="upload" size={28} />
          <h2>Drop purchase orders, receipts, and invoices</h2>
          <p className="muted">Reconcile works out which is which and which PO they belong to.</p>
          <label className="btn btn-primary" htmlFor="file-input">
            Choose files
          </label>
          <input
            id="file-input"
            ref={input}
            className="sr-only"
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            onChange={(e) => {
              if (e.target.files?.length) void upload(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        {sent.length > 0 && (
          <section className="panel" aria-labelledby="sent-h">
            <div className="panel-head">
              <h2 id="sent-h">This upload</h2>
              <span className="faint small">Updates live</span>
            </div>
            <Rows
              rows={sent.map((r) => ({
                key: r.key,
                name: r.name,
                doc: r.id ? byId.get(r.id) : undefined,
                sent: r,
              }))}
            />
          </section>
        )}
        {earlier.length > 0 && (
          <section className="panel" aria-labelledby="earlier-h">
            <div className="panel-head">
              <h2 id="earlier-h">Earlier uploads</h2>
            </div>
            <Rows
              rows={earlier.map((d) => ({
                key: d.id,
                name: d.docNumber ?? 'Not read yet',
                doc: d,
              }))}
            />
          </section>
        )}
      </div>
    </>
  );
}

function Rows({
  rows,
}: {
  rows: { key: string; name: string; doc?: DocumentSummary; sent?: Sent }[];
}) {
  return (
    <div className="table-wrap">
      <table className="ledger" aria-live="polite">
        <thead>
          <tr>
            <th scope="col">File</th>
            <th scope="col">Status</th>
            <th scope="col">Progress</th>
            <th scope="col">Belongs to</th>
            <th scope="col">When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, name, doc, sent }) => {
            const ds = doc ? DOC_STATUS[doc.status]! : undefined;
            const step =
              sent?.error || doc?.status === 'FAILED' ? -1 : ds ? ds.step : sent?.id ? 1 : 0;
            return (
              <tr key={key} data-status={doc?.status ?? (sent?.error ? 'REJECTED' : 'SENDING')}>
                <td>
                  <span className="row" style={{ flexWrap: 'nowrap' }}>
                    <Icon name="file" />
                    {doc ? (
                      <Link href={`/documents/${doc.id}`} className="mono">
                        {name}
                      </Link>
                    ) : (
                      <span className="mono">{name}</span>
                    )}
                  </span>
                  {doc?.type && <div className="faint tiny">{docTypeWords(doc.type)}</div>}
                </td>
                <td>
                  {sent?.error ? (
                    <span className="field-error">{sent.error}</span>
                  ) : ds ? (
                    <span className="row">
                      <Tag tone={ds.tone}>
                        {ds.label}
                        {doc!.status === 'EXTRACTING' ? '…' : ''}
                      </Tag>
                      {sent?.duplicate && <Tag tone="neutral">Already uploaded</Tag>}
                    </span>
                  ) : (
                    <span className="faint">Sending…</span>
                  )}
                </td>
                <td>
                  <span
                    className={s.steps}
                    role="img"
                    aria-label={step > 0 ? `Step ${step} of 4` : step < 0 ? 'Stopped' : 'Sending'}
                  >
                    {STEPS.map((label, k) => (
                      <span
                        key={label}
                        className={`${s.step} ${step < 0 ? s.failed : k < step - 1 || step === 4 ? s.done : k === step - 1 ? s.now : ''}`}
                      />
                    ))}
                  </span>
                </td>
                <td>
                  {doc?.poNumber ? (
                    <Link className="mono" href={`/pos/${doc.poNumber}`}>
                      {doc.poNumber}
                    </Link>
                  ) : (
                    <span className="skeleton" style={{ width: 96, opacity: step < 0 ? 0 : 1 }} />
                  )}
                </td>
                <td className="faint">{doc ? when(doc.uploadedAt) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
