import type { z } from 'zod';
import type { FieldLocation } from '@reconcile/core';

export type Location = z.infer<typeof FieldLocation>;

export interface TextOpts {
  font?: 'R' | 'B';
  size?: number;
  color?: string;
  /** Box width for alignment; text never wraps. */
  width?: number;
  align?: 'left' | 'right' | 'center';
  /** Shrink the font until the text fits `width`. */
  fit?: boolean;
}

/**
 * Draws text and remembers where each named field landed, normalized to [0,1] with a top-left
 * origin. This is how the answer key gets exact field locations for free (ADR-0007).
 */
export class FieldRecorder {
  readonly fields = new Map<string, Location>();
  page = 1;

  constructor(readonly doc: PDFKit.PDFDocument) {}

  text(field: string | undefined, str: string, x: number, y: number, opts: TextOpts = {}): number {
    const { doc } = this;
    let size = opts.size ?? 9;
    doc.font(opts.font ?? 'R').fontSize(size);
    if (opts.fit && opts.width) {
      while (size > 5 && doc.widthOfString(str) > opts.width - 2) {
        size -= 0.5;
        doc.fontSize(size);
      }
    }
    const w = doc.widthOfString(str);
    const boxW = opts.width ?? w;
    const x0 =
      opts.align === 'right' ? x + boxW - w : opts.align === 'center' ? x + (boxW - w) / 2 : x;
    doc.fillColor(opts.color ?? '#111111').text(str, x0, y, { lineBreak: false });
    if (field) {
      const pw = doc.page.width;
      const ph = doc.page.height;
      const clamp = (n: number) => Math.min(1, Math.max(0, n));
      const r = (n: number) => Math.round(n * 10000) / 10000;
      this.fields.set(field, {
        page: this.page,
        bbox: [
          r(clamp(x0 / pw)),
          r(clamp(y / ph)),
          r(clamp((x0 + Math.max(w, 1)) / pw)),
          r(clamp((y + size * 1.2) / ph)),
        ],
      });
    }
    return w;
  }

  location(field: string): Location {
    const loc = this.fields.get(field);
    if (!loc) throw new Error(`field "${field}" was never drawn`);
    return loc;
  }
}
