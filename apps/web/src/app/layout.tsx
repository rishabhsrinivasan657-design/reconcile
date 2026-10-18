import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/500.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@/styles/tokens.css';
import '@/styles/globals.css';
import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/Providers';
import { Shell } from '@/components/Shell';
import { themeBootScript } from '@/components/ThemeToggle';

export const metadata: Metadata = {
  title: { default: 'Reconcile', template: '%s · Reconcile' },
  description: 'Purchase orders, receipts, and invoices, matched and explained.',
  icons: { icon: '/icon.svg' },
};
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f2e9' }, // token-exempt: browser chrome color
    { media: '(prefers-color-scheme: dark)', color: '#121618' }, // token-exempt: browser chrome color
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
