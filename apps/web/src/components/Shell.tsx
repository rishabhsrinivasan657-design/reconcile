'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, unwrap } from '@/lib/api';
import { useKeys } from '@/lib/keys';
import { Icon, type IconName } from './Icon';
import { useUi } from './Providers';
import { SearchDialog, ShortcutsDialog } from './Dialogs';
import { ThemeToggle } from './ThemeToggle';
import s from './Shell.module.css';

const NAV: { href: string; label: string; icon: IconName; key: string }[] = [
  { href: '/', label: 'Overview', icon: 'home', key: 'o' },
  { href: '/problems', label: 'Problems', icon: 'alert', key: 'p' },
  { href: '/pos', label: 'POs', icon: 'book', key: 'l' },
  { href: '/review', label: 'Review', icon: 'eye', key: 'r' },
  { href: '/upload', label: 'Upload', icon: 'upload', key: 'u' },
];

const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** The frame around every page: side bar with live counts, the user, and global shortcuts. */
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const ui = useUi();
  const overview = useQuery({
    queryKey: ['overview'],
    queryFn: () => unwrap(api.GET('/overview')),
  });
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => unwrap(api.GET('/me')),
    staleTime: Infinity,
  });
  const counts: Record<string, number | undefined> = {
    '/problems': overview.data?.openProblems,
    '/pos': overview.data?.sets.total,
    '/review': overview.data?.documents.needsReview,
  };

  useKeys({
    '?': () => ui.openDialog('shortcuts'),
    '/': () => ui.openDialog('search'),
    ...Object.fromEntries(NAV.map((n) => [`g ${n.key}`, () => router.push(n.href)])),
  });

  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <div className={s.app}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className={s.side} aria-label="Main">
        <Link href="/" className={s.brand}>
          <Icon name="logo" size={24} />
          <b>Reconcile</b>
        </Link>
        <nav className={s.nav} aria-label="Pages">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined}>
              <Icon name={n.icon} size={18} />
              {n.label}
              {counts[n.href] !== undefined && counts[n.href]! > 0 && (
                <span className={`${s.count} ${n.href === '/problems' ? s.hot : ''}`}>
                  <span className="sr-only">: </span>
                  {counts[n.href]}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className={s.foot}>
          <button className="link-btn small" onClick={() => ui.openDialog('search')}>
            <Icon name="search" /> Find <span className="kbd">/</span>
          </button>
          <ThemeToggle />
          <button className="link-btn small" onClick={() => ui.openDialog('shortcuts')}>
            <Icon name="keyboard" /> Shortcuts <span className="kbd">?</span>
          </button>
          <span className={s.live} data-status={ui.live}>
            <i aria-hidden="true" />
            {ui.live === 'live'
              ? 'Live updates on'
              : ui.live === 'offline'
                ? 'Reconnecting…'
                : 'Connecting…'}
          </span>
          {me.data && (
            <div className={s.user}>
              <span className={s.avatar} aria-hidden="true">
                {initials(me.data.name)}
              </span>
              <div>
                <div>{me.data.name.replace(/\s*\(.*\)$/, '')}</div>
                <div className="faint tiny">Accounts payable</div>
              </div>
            </div>
          )}
        </div>
      </aside>
      <main id="main" className={s.main} tabIndex={-1}>
        {children}
      </main>
      <ShortcutsDialog />
      <SearchDialog />
    </div>
  );
}
