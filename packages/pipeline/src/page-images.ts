import type { Document } from '@reconcile/db';
import { renderPages, type InputMime } from '@reconcile/extraction';
import type { Storage } from './storage.ts';

/**
 * One page of a document as an image, for the highlight viewer (M5 AC-4). PDFs are drawn once
 * at the same resolution the AI saw, then kept in storage; images are returned as they are.
 * Returns undefined when the page doesn't exist.
 */
export async function pageImage(
  storage: Storage,
  doc: Pick<Document, 'sha256' | 'storagePath' | 'mimeType'>,
  page: number,
): Promise<{ mimeType: string; bytes: Uint8Array } | undefined> {
  if (doc.mimeType !== 'application/pdf')
    return page === 1
      ? { mimeType: doc.mimeType, bytes: await storage.read(doc.storagePath) }
      : undefined;
  const key = `pages/${doc.sha256}-${page}.png`;
  try {
    return { mimeType: 'image/png', bytes: await storage.read(key) };
  } catch {
    // Not drawn yet: draw every page once and keep them.
  }
  const pages = await renderPages(await storage.read(doc.storagePath), doc.mimeType as InputMime);
  await Promise.all(pages.map((p, i) => storage.put(`pages/${doc.sha256}-${i + 1}.png`, p.data)));
  const hit = pages[page - 1];
  return hit ? { mimeType: 'image/png', bytes: hit.data } : undefined;
}
