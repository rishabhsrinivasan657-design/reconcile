import { createRequire } from 'node:module';
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Rng } from '../rng.ts';
import type { Location } from './recorder.ts';

const require = createRequire(import.meta.url);
const standardFontDataUrl = require
  .resolve('pdfjs-dist/package.json')
  .replace('package.json', 'standard_fonts/');

export const SCAN_DPI = 150;

/** Render page 1 of a PDF onto a white canvas at the given DPI. */
export async function rasterize(pdf: Uint8Array, dpi = SCAN_DPI): Promise<Canvas> {
  const task = getDocument({
    data: new Uint8Array(pdf),
    standardFontDataUrl,
    verbosity: 0,
  });
  const loaded = await task.promise;
  try {
    const page = await loaded.getPage(1);
    const viewport = page.getViewport({ scale: dpi / 72 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // pdfjs types expect DOM canvas types; @napi-rs/canvas implements the same 2D API.
    await page.render({ canvasContext: ctx as never, canvas: canvas as never, viewport }).promise;
    return canvas;
  } finally {
    await task.destroy();
  }
}

export interface ScanResult {
  png: Buffer;
  /** Map a field location on the clean page to its location on the scan. */
  transform: (loc: Location) => Location;
}

/**
 * Make a single-page PDF look scanned (M1 AC-15): slight rotation, grayscale, blur, contrast
 * loss, and salt-and-pepper noise. All effects come from the seeded Rng (ADR-0006).
 */
export async function simulateScan(pdf: Uint8Array, rng: Rng): Promise<ScanResult> {
  const clean = await rasterize(pdf);
  const { width: w, height: h } = clean;
  const angle = (rng.range(0.5, 2.5) * (rng.chance(0.5) ? 1 : -1) * Math.PI) / 180;

  const out = createCanvas(w, h);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.filter = `blur(${rng.range(0.3, 0.8).toFixed(2)}px)`;
  ctx.translate(w / 2, h / 2);
  ctx.rotate(angle);
  ctx.drawImage(clean, -w / 2, -h / 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const contrast = rng.range(0.78, 0.9);
  const lift = rng.range(10, 28);
  const noise = rng.range(0.001, 0.004);
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
    let v = gray * contrast + lift;
    if (rng.float() < noise) v = rng.chance(0.5) ? rng.int(0, 60) : rng.int(200, 255);
    v = Math.max(0, Math.min(255, Math.round(v)));
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const transform = (loc: Location): Location => {
    const [x0, y0, x1, y1] = loc.bbox;
    const corners = [
      [x0, y0],
      [x1, y0],
      [x0, y1],
      [x1, y1],
    ].map(([x, y]) => {
      const px = x! * w - w / 2;
      const py = y! * h - h / 2;
      return [(px * cos - py * sin + w / 2) / w, (px * sin + py * cos + h / 2) / h] as const;
    });
    const clamp = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    return {
      page: loc.page,
      bbox: [
        clamp(Math.min(...xs)),
        clamp(Math.min(...ys)),
        clamp(Math.max(...xs)),
        clamp(Math.max(...ys)),
      ],
    };
  };

  return { png: await out.encode('png'), transform };
}
