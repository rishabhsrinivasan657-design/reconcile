'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api, unwrap } from '@/lib/api';
import { docTypeWords } from '@/lib/words';
import { Icon } from './Icon';
import { useUi } from './Providers';

const SHORTCUTS: [string[], string][] = [
  [['J', 'K'], 'Next or previous problem'],
  [['A'], 'Approve'],
  [['D'], 'Dispute'],
  [['W'], 'Write off'],
  [['E'], 'Edit the selected field'],
  [['/'], 'Find a PO or document'],
  [['G', 'O'], 'Go to overview'],
  [['G', 'P'], 'Go to problems'],
  [['G', 'L'], 'Go to POs'],
  [['G', 'R'], 'Go to review'],
  [['G', 'U'], 'Go to upload'],
  [['?'], 'Show this list'],
  [['Esc'], 'Close'],
];

function Frame({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-scrim" />
        <Dialog.Content className="dialog" aria-describedby={undefined}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <Dialog.Title asChild>
              <h2>{title}</h2>
            </Dialog.Title>
            <Dialog.Close className="btn btn-ghost">
              Close <span className="kbd">Esc</span>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ShortcutsDialog() {
  const ui = useUi();
  return (
    <Frame
      open={ui.dialog === 'shortcuts'}
      onClose={() => ui.openDialog('none')}
      title="Keyboard shortcuts"
    >
      <dl className="keys">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={what} style={{ display: 'contents' }}>
            <dt>
              {keys.map((k) => (
                <span className="kbd" key={k}>
                  {k}
                </span>
              ))}
            </dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </Frame>
  );
}

/** "/" jumps to any PO or document by its number. */
export function SearchDialog() {
  const ui = useUi();
  const router = useRouter();
  const open = ui.dialog === 'search';
  const [q, setQ] = useState('');
  const sets = useQuery({
    queryKey: ['sets'],
    queryFn: () => unwrap(api.GET('/sets')),
    enabled: open,
  });
  const docs = useQuery({
    queryKey: ['documents', 'all'],
    queryFn: () => unwrap(api.GET('/documents', { params: { query: { limit: 500 } } })),
    enabled: open,
  });
  const results = useMemo(() => {
    const needle = q.trim().toUpperCase().replace(/\s+/g, '');
    if (!needle) return [];
    const out: { href: string; title: string; sub: string }[] = [];
    for (const s of sets.data ?? [])
      if (s.poNumber.includes(needle))
        out.push({ href: `/pos/${s.poNumber}`, title: s.poNumber, sub: 'Purchase order set' });
    for (const d of docs.data ?? [])
      if (d.docNumber?.toUpperCase().includes(needle))
        out.push({
          href: `/documents/${d.id}`,
          title: d.docNumber,
          sub: `${docTypeWords(d.type)}${d.poNumber ? ` · ${d.poNumber}` : ''}`,
        });
    return out.slice(0, 8);
  }, [q, sets.data, docs.data]);
  const go = (href: string) => {
    ui.openDialog('none');
    setQ('');
    router.push(href);
  };
  return (
    <Frame open={open} onClose={() => ui.openDialog('none')} title="Find a PO or document">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (results[0]) go(results[0].href);
        }}
      >
        <label className="sr-only" htmlFor="search-input">
          PO, invoice, or receipt number
        </label>
        <input
          id="search-input"
          type="search"
          autoFocus
          autoComplete="off"
          placeholder="HP-PO-104157"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>
      {q.trim() && (
        <ul className="results">
          {results.length === 0 ? (
            <li className="muted small">No PO or document number contains “{q.trim()}”.</li>
          ) : (
            results.map((r) => (
              <li key={r.href}>
                <button onClick={() => go(r.href)}>
                  <Icon name={r.href.startsWith('/pos') ? 'book' : 'file'} />
                  <span className="mono">{r.title}</span>
                  <span className="faint small">{r.sub}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </Frame>
  );
}
