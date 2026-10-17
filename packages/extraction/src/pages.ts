import { createRequire } from 'node:module';
import { createCanvas } from '@napi-rs/canvas';
import type { ImagePart } from '@reconcile/llm';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const require = createRequire(import.meta.url);
const standardFontDataUrl = require
  .resolve('pdfjs-dist/package.json')
  .replace('package.json', 'standard_fonts/');

export const RENDER_DPI = 150;

export type InputMime = 'application/pdf' | 'image/png' | 'image/jpeg';

export function mimeFor(file: string): InputMime {
  const ext = file.toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  throw new Error(`Unsupported file type: ${file} (use PDF, PNG, or JPEG)`);
}

/** PDF pages become PNGs at 150 DPI; images are sent as they are (M3 design 3.1). */
export async function renderPages(bytes: Uint8Array, mime: InputMime): Promise<ImagePart[]> {
  if (mime !== 'application/pdf') return [{ mimeType: mime, data: bytes }];
  const task = getDocument({ data: new Uint8Array(bytes), standardFontDataUrl, verbosity: 0 });
  const pdf = await task.promise;
  try {
    const pages: ImagePart[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: RENDER_DPI / 72 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // pdfjs types expect DOM canvas types; @napi-rs/canvas implements the same 2D API.
      await page.render({ canvasContext: ctx as never, canvas: canvas as never, viewport }).promise;
      pages.push({ mimeType: 'image/png', data: await canvas.encode('png') });
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
