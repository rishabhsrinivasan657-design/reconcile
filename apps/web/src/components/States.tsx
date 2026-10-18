import { Icon } from './Icon';

/** Grey bars shaped like rows, while data loads (no spinners for page loads). */
export function SkeletonRows({ rows = 5, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      style={{ padding: 'var(--space-4)', display: 'grid', gap: 18 }}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'grid', gap: 8 }}>
          <span className="skeleton" style={{ width: `${60 + ((i * 17) % 35)}%` }} />
          <span className="skeleton" style={{ width: `${30 + ((i * 23) % 30)}%`, height: 8 }} />
        </div>
      ))}
    </div>
  );
}

/** An invitation, not an apology: what this place is for, and what to do next. */
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="state">
      <Icon name="check" size={28} />
      <h2>{title}</h2>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

/** What happened, then what to do. */
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div className="state error" role="alert">
      <Icon name="alert" size={28} />
      <h2>Couldn’t load this</h2>
      <p className="muted">{message}</p>
      {retry && (
        <button className="btn" onClick={retry}>
          <Icon name="refresh" /> Try again
        </button>
      )}
    </div>
  );
}
