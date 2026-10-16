import { createRequire } from 'node:module';
import type { FontKey } from '../catalog/index.ts';

const require = createRequire(import.meta.url);

/** Built-in PDF fonts (not embedded) and open-licensed (OFL) web fonts from @fontsource. */
const STANDARD: Partial<Record<FontKey, readonly [string, string]>> = {
  helvetica: ['Helvetica', 'Helvetica-Bold'],
  times: ['Times-Roman', 'Times-Bold'],
  courier: ['Courier', 'Courier-Bold'],
};

const FONTSOURCE: Partial<Record<FontKey, string>> = {
  inter: 'inter',
  'plex-sans': 'ibm-plex-sans',
  'roboto-mono': 'roboto-mono',
  'source-code-pro': 'source-code-pro',
  'source-serif': 'source-serif-4',
  'roboto-condensed': 'roboto-condensed',
  lato: 'lato',
};

// WOFF, not WOFF2: fontkit fails to subset most fontsource WOFF2 files (checked font by font).
const fontFile = (pkg: string, weight: 400 | 700) =>
  require.resolve(`@fontsource/${pkg}/files/${pkg}-latin-${weight}-normal.woff`);

/** Register `R` (regular) and `B` (bold) on a document for the given font key. */
export function registerFonts(doc: PDFKit.PDFDocument, key: FontKey): void {
  const std = STANDARD[key];
  if (std) {
    doc.registerFont('R', std[0]);
    doc.registerFont('B', std[1]);
    return;
  }
  const pkg = FONTSOURCE[key];
  if (!pkg) throw new Error(`unknown font ${key}`);
  doc.registerFont('R', fontFile(pkg, 400));
  doc.registerFont('B', fontFile(pkg, 700));
}
