import type { DocumentFields } from '@reconcile/core';
import PDFDocument from 'pdfkit';
import type { Column, DocStyle, TemplateFamily } from '../catalog/index.ts';
import { formatDate } from '../dates.ts';
import type { DocSpec, LineSpec } from '../model.ts';
import { registerFonts } from './fonts.ts';
import { FieldRecorder } from './recorder.ts';

/** Fixed metadata so the same input always yields the same bytes (ADR-0006, ADR-0007). */
const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
const PAGE_W = 612;
const PAGE_H = 792;
const LEFT = 50;
const RIGHT = PAGE_W - 50;
const BOTTOM = PAGE_H - 70;
const GREY = '#6b7280';
const LIGHT = '#d1d5db';

interface FamilyMetrics {
  rowH: number;
  body: number;
  dollar: boolean;
  /** Extra space reserved under the header (letterhead docs are tall, so long ones break pages). */
  headerPad: number;
}

const METRICS: Record<TemplateFamily, FamilyMetrics> = {
  classic: { rowH: 18, body: 8.5, dollar: true, headerPad: 0 },
  modern: { rowH: 22, body: 9, dollar: true, headerPad: 10 },
  erp: { rowH: 12, body: 7.5, dollar: false, headerPad: 0 },
  twocol: { rowH: 18, body: 8.5, dollar: true, headerPad: 0 },
  boxed: { rowH: 20, body: 8.5, dollar: false, headerPad: 0 },
  letterhead: { rowH: 24, body: 9.5, dollar: true, headerPad: 60 },
};

const BASE_WIDTHS: Record<Exclude<Column, 'description'>, number> = {
  sku: 70,
  qty: 46,
  uom: 36,
  unitPrice: 62,
  lineTotal: 72,
};
const RIGHT_ALIGNED = new Set<Column>(['qty', 'unitPrice', 'lineTotal']);

interface Col {
  key: Column;
  x: number;
  w: number;
}

interface Meta {
  label: string;
  value: string;
  field?: string;
}

function money(value: string, dollar: boolean): string {
  const [int, frac = '00'] = value.replace('-', '').split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${value.startsWith('-') ? '-' : ''}${dollar ? '$' : ''}${grouped}.${frac}`;
}

class Renderer {
  readonly doc: PDFKit.PDFDocument;
  readonly rec: FieldRecorder;
  readonly m: FamilyMetrics;
  readonly cols: Col[];
  y = 50;

  constructor(
    readonly spec: DocSpec,
    readonly style: DocStyle,
  ) {
    this.doc = new PDFDocument({
      size: 'LETTER',
      margin: 0,
      bufferPages: true,
      info: {
        Title: `${spec.title} ${spec.docNumber}`,
        Author: spec.from[0],
        Producer: 'Reconcile synthetic generator',
        Creator: 'Reconcile synthetic generator',
        CreationDate: FIXED_DATE,
        ModDate: FIXED_DATE,
      },
    });
    registerFonts(this.doc, style.font);
    this.rec = new FieldRecorder(this.doc);
    this.m = METRICS[style.family];
    this.cols = this.layoutColumns();
  }

  private get family() {
    return this.style.family;
  }

  private layoutColumns(): Col[] {
    const keys = this.style.columns.filter(
      (c) => this.spec.type !== 'RR' || (c !== 'unitPrice' && c !== 'lineTotal'),
    );
    const fixed = keys.reduce((s, k) => s + (k === 'description' ? 0 : BASE_WIDTHS[k]), 0);
    let x = LEFT;
    return keys.map((key) => {
      const w = key === 'description' ? RIGHT - LEFT - fixed : BASE_WIDTHS[key];
      const col = { key, x, w };
      x += w;
      return col;
    });
  }

  private metas(): Meta[] {
    const s = this.spec;
    const out: Meta[] = [{ label: s.docNumberLabel, value: s.docNumber, field: 'docNumber' }];
    if (s.poNumber) {
      out.push({
        label: s.type === 'RR' ? 'PO Number' : 'Customer PO',
        value: s.poNumber,
        field: 'poNumber',
      });
    }
    out.push({
      label: s.dateLabel,
      value: formatDate(s.date, this.style.dateFormat),
      field: 'date',
    });
    if (s.dueDate) {
      out.push({
        label: 'Due Date',
        value: formatDate(s.dueDate, this.style.dateFormat),
        field: 'dueDate',
      });
    }
    for (const [label, value] of s.extras) out.push({ label, value });
    if (s.type === 'INVOICE' && ['classic', 'modern', 'twocol'].includes(this.family)) {
      out.push({ label: 'Currency', value: 'USD', field: 'currency' });
    }
    return out;
  }

  /** Field name for the first line of a party block (the vendor's name on POs and RRs). */
  private partyField(label: string) {
    return label === 'Vendor' ? 'vendorName' : undefined;
  }

  private issuerField() {
    return this.spec.type === 'INVOICE' ? 'vendorName' : undefined;
  }

  // ---------------------------------------------------------------- header ------------
  private header(): void {
    const { doc, rec, spec, style } = this;
    const metas = this.metas();
    const accent = style.accent;

    switch (this.family) {
      case 'classic': {
        rec.text(this.issuerField(), spec.from[0]!, LEFT, 50, { font: 'B', size: 14 });
        rec.text(undefined, spec.from[1] ?? '', LEFT, 68, { size: 8.5, color: GREY });
        rec.text(undefined, spec.title, 312, 46, {
          font: 'B',
          size: 20,
          color: accent,
          width: 250,
          align: 'right',
        });
        let y = 78;
        for (const m of metas) {
          rec.text(undefined, m.label, 362, y, { size: 8, color: GREY });
          rec.text(m.field, m.value, 362, y, { font: 'B', size: 9, width: 200, align: 'right' });
          y += 14;
        }
        y = Math.max(y, 100) + 14;
        spec.parties.forEach((p, i) => {
          const x = LEFT + i * 262;
          doc.rect(x, y, 250, 14).fill(accent);
          rec.text(undefined, p.label.toUpperCase(), x + 6, y + 3, {
            font: 'B',
            size: 7.5,
            color: '#ffffff',
          });
          p.lines.forEach((line, j) => {
            rec.text(j === 0 ? this.partyField(p.label) : undefined, line, x + 6, y + 20 + j * 12, {
              size: 9,
            });
          });
        });
        this.y = y + 20 + 2 * 12 + 18;
        break;
      }
      case 'modern': {
        doc.rect(0, 0, PAGE_W, 8).fill(accent);
        rec.text(undefined, spec.title.charAt(0) + spec.title.slice(1).toLowerCase(), LEFT, 36, {
          size: 26,
          color: accent,
        });
        rec.text(this.issuerField(), spec.from[0]!, 312, 38, {
          font: 'B',
          size: 11,
          width: 250,
          align: 'right',
        });
        rec.text(undefined, spec.from[1] ?? '', 312, 54, {
          size: 8,
          color: GREY,
          width: 250,
          align: 'right',
        });
        const perRow = 4;
        const colW = (RIGHT - LEFT) / perRow;
        metas.forEach((m, i) => {
          const x = LEFT + (i % perRow) * colW;
          const y = 96 + Math.floor(i / perRow) * 34;
          rec.text(undefined, m.label.toUpperCase(), x, y, { size: 6.5, color: GREY });
          rec.text(m.field, m.value, x, y + 10, { font: 'B', size: 10 });
        });
        let y = 96 + Math.ceil(metas.length / perRow) * 34 + 10;
        spec.parties.forEach((p, i) => {
          const x = LEFT + i * 256;
          rec.text(undefined, p.label.toUpperCase(), x, y, { size: 6.5, color: GREY });
          p.lines.forEach((line, j) => {
            rec.text(j === 0 ? this.partyField(p.label) : undefined, line, x, y + 11 + j * 12, {
              size: 9,
            });
          });
        });
        y += 11 + 2 * 12 + 18;
        this.y = y;
        break;
      }
      case 'erp': {
        const size = 8;
        rec.text(undefined, `*** ${spec.title} ***`, LEFT, 40, {
          font: 'B',
          size: 12,
          width: RIGHT - LEFT,
          align: 'center',
        });
        rec.text(this.issuerField(), spec.from[0]!.toUpperCase(), LEFT, 62, { font: 'B', size });
        rec.text(undefined, (spec.from[1] ?? '').toUpperCase(), LEFT, 73, { size });
        this.rule('=', 88, size);
        let y = 100;
        metas.forEach((m, i) => {
          const x = i % 2 === 0 ? LEFT : 312;
          if (i % 2 === 0 && i > 0) y += 12;
          rec.text(undefined, `${m.label.toUpperCase()}:`, x, y, { size });
          rec.text(m.field, m.value, x + 100, y, { font: 'B', size });
        });
        y += 20;
        spec.parties.forEach((p, i) => {
          const x = i === 0 ? LEFT : 312;
          rec.text(undefined, `${p.label.toUpperCase()}:`, x, y, { font: 'B', size });
          p.lines.forEach((line, j) => {
            rec.text(
              j === 0 ? this.partyField(p.label) : undefined,
              line.toUpperCase(),
              x,
              y + 11 + j * 11,
              { size },
            );
          });
        });
        y += 11 + 2 * 11 + 6;
        this.rule('=', y, size);
        this.y = y + 14;
        break;
      }
      case 'twocol': {
        rec.text(this.issuerField(), spec.from[0]!, LEFT, 40, {
          font: 'B',
          size: 16,
          width: RIGHT - LEFT,
          align: 'center',
        });
        rec.text(undefined, spec.from[1] ?? '', LEFT, 60, {
          size: 8.5,
          color: GREY,
          width: RIGHT - LEFT,
          align: 'center',
        });
        doc.moveTo(LEFT, 76).lineTo(RIGHT, 76).lineWidth(1.5).strokeColor(accent).stroke();
        rec.text(undefined, spec.title, LEFT, 92, { font: 'B', size: 18, color: accent });
        let ly = 122;
        for (const p of spec.parties) {
          rec.text(undefined, p.label, LEFT, ly, { font: 'B', size: 9, color: accent });
          p.lines.forEach((line, j) => {
            rec.text(j === 0 ? this.partyField(p.label) : undefined, line, LEFT, ly + 12 + j * 11, {
              size: 8.5,
            });
          });
          ly += 12 + p.lines.length * 11 + 10;
        }
        let ry = 92;
        for (const m of metas) {
          doc.rect(332, ry, 90, 16).fillAndStroke('#f3f4f6', LIGHT);
          doc.rect(422, ry, 140, 16).stroke(LIGHT);
          rec.text(undefined, m.label, 337, ry + 4, { size: 7.5, color: '#374151' });
          rec.text(m.field, m.value, 427, ry + 4, {
            font: 'B',
            size: 8.5,
            width: 130,
            align: 'right',
            fit: true,
          });
          ry += 16;
        }
        this.y = Math.max(ly, ry) + 16;
        break;
      }
      case 'boxed': {
        rec.text(undefined, spec.title, LEFT, 40, { font: 'B', size: 16 });
        rec.text(this.spec.type === 'INVOICE' ? 'vendorName' : undefined, spec.from[0]!, LEFT, 60, {
          size: 9,
        });
        rec.text(undefined, spec.from[1] ?? '', LEFT, 72, { size: 8, color: GREY });
        const boxW = (RIGHT - LEFT) / 3;
        let y = 92;
        metas.forEach((m, i) => {
          const x = LEFT + (i % 3) * boxW;
          if (i % 3 === 0 && i > 0) y += 30;
          doc.rect(x, y, boxW, 30).lineWidth(0.8).stroke('#374151');
          rec.text(undefined, m.label.toUpperCase(), x + 4, y + 3, { size: 6.5, color: GREY });
          rec.text(m.field, m.value, x + 4, y + 14, {
            font: 'B',
            size: 9,
            width: boxW - 8,
            fit: true,
          });
        });
        y += 40;
        spec.parties.forEach((p, i) => {
          const x = LEFT + i * ((RIGHT - LEFT) / 2);
          const w = (RIGHT - LEFT) / 2;
          doc.rect(x, y, w, 44).lineWidth(0.8).stroke('#374151');
          rec.text(undefined, p.label.toUpperCase(), x + 4, y + 3, { size: 6.5, color: GREY });
          p.lines.forEach((line, j) => {
            rec.text(j === 0 ? this.partyField(p.label) : undefined, line, x + 4, y + 14 + j * 12, {
              size: 8.5,
              width: w - 8,
              fit: true,
            });
          });
        });
        this.y = y + 56;
        break;
      }
      case 'letterhead': {
        rec.text(this.issuerField(), spec.from[0]!, LEFT, 42, {
          font: 'B',
          size: 20,
          width: RIGHT - LEFT,
          align: 'center',
          color: accent,
        });
        rec.text(undefined, spec.from[1] ?? '', LEFT, 68, {
          size: 9,
          width: RIGHT - LEFT,
          align: 'center',
          color: GREY,
        });
        doc
          .moveTo(LEFT + 80, 86)
          .lineTo(RIGHT - 80, 86)
          .lineWidth(0.6)
          .strokeColor(accent)
          .stroke();
        rec.text(undefined, spec.title.split('').join(' '), LEFT, 108, { font: 'B', size: 13 });
        let y = 134;
        for (const m of metas) {
          const w = rec.text(undefined, `${m.label}:`, LEFT, y, { size: 9.5 });
          rec.text(m.field, m.value, LEFT + w + 5, y, { font: 'B', size: 9.5 });
          y += 15;
        }
        let py = 134;
        for (const p of spec.parties) {
          rec.text(undefined, p.label, 340, py, { font: 'B', size: 9.5 });
          p.lines.forEach((line, j) => {
            rec.text(j === 0 ? this.partyField(p.label) : undefined, line, 340, py + 13 + j * 12, {
              size: 9.5,
              width: 222,
              fit: true,
            });
          });
          py += 13 + p.lines.length * 12 + 12;
        }
        y = Math.max(y, py) + 12;
        rec.text(undefined, 'We are pleased to submit the following for your records.', LEFT, y, {
          size: 9.5,
          color: GREY,
        });
        this.y = y + 24 + this.m.headerPad;
        break;
      }
    }
  }

  private rule(char: string, y: number, size: number) {
    this.doc.font('R').fontSize(size);
    const n = Math.floor((RIGHT - LEFT) / this.doc.widthOfString(char));
    this.rec.text(undefined, char.repeat(n), LEFT, y, { size });
  }

  // ---------------------------------------------------------------- table -------------
  private tableHeader(): void {
    const { doc, rec, style } = this;
    const y = this.y;
    const h = 16;
    switch (this.family) {
      case 'classic':
        doc.rect(LEFT, y, RIGHT - LEFT, h).fill(style.accent);
        break;
      case 'twocol':
        doc.rect(LEFT, y, RIGHT - LEFT, h).fillAndStroke('#e5e7eb', LIGHT);
        break;
      case 'letterhead':
        doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.8).strokeColor('#111111').stroke();
        break;
    }
    for (const c of this.cols) {
      if (this.family === 'boxed') doc.rect(c.x, y, c.w, h).lineWidth(0.8).stroke('#374151');
      const label =
        this.family === 'modern' || this.family === 'erp'
          ? style.labels[c.key].toUpperCase()
          : style.labels[c.key];
      rec.text(undefined, label, c.x + 4, y + 4, {
        font: 'B',
        size: this.family === 'modern' ? 6.5 : 7.5,
        color: this.family === 'classic' ? '#ffffff' : this.family === 'modern' ? GREY : '#111111',
        width: c.w - 8,
        align: RIGHT_ALIGNED.has(c.key) ? 'right' : 'left',
        fit: true,
      });
    }
    this.y += h;
    if (this.family === 'erp') {
      this.rule('-', this.y, this.m.body);
      this.y += 10;
    } else if (this.family === 'modern' || this.family === 'letterhead') {
      doc
        .moveTo(LEFT, this.y)
        .lineTo(RIGHT, this.y)
        .lineWidth(0.6)
        .strokeColor(this.family === 'modern' ? LIGHT : '#111111')
        .stroke();
      this.y += 2;
    }
  }

  private cellText(line: LineSpec, key: Column): string {
    switch (key) {
      case 'sku':
        return line.sku ?? '';
      case 'description':
        return line.description;
      case 'qty':
        return String(line.qty);
      case 'uom':
        return line.uom;
      case 'unitPrice':
        return line.unitPrice ? money(line.unitPrice, this.m.dollar) : '';
      case 'lineTotal':
        return line.lineTotal ? money(line.lineTotal, this.m.dollar) : '';
    }
  }

  private row(line: LineSpec, index: number): void {
    const { doc, rec, m } = this;
    if (this.y + m.rowH > BOTTOM) this.newPage(true);
    const y = this.y;
    if (this.family === 'twocol' && index % 2 === 1)
      doc.rect(LEFT, y, RIGHT - LEFT, m.rowH).fill('#f3f4f6');
    for (const c of this.cols) {
      if (this.family === 'boxed') doc.rect(c.x, y, c.w, m.rowH).lineWidth(0.5).stroke('#6b7280');
      const text = this.cellText(line, c.key);
      if (!text) continue;
      rec.text(`lines.${index}.${c.key}`, text, c.x + 4, y + (m.rowH - m.body) / 2 - 1, {
        size: m.body,
        width: c.w - 8,
        align: RIGHT_ALIGNED.has(c.key) ? 'right' : 'left',
        fit: true,
      });
    }
    this.y += m.rowH;
    if (this.family === 'classic') {
      doc.moveTo(LEFT, this.y).lineTo(RIGHT, this.y).lineWidth(0.4).strokeColor(LIGHT).stroke();
    }
  }

  private newPage(continuingTable: boolean): void {
    this.doc.addPage({ size: 'LETTER', margin: 0 });
    this.rec.page += 1;
    this.y = 50;
    if (continuingTable) {
      this.rec.text(
        undefined,
        `${this.spec.title} ${this.spec.docNumber} (continued)`,
        LEFT,
        this.y,
        { size: 8, color: GREY },
      );
      this.y += 18;
      this.tableHeader();
    }
  }

  // ---------------------------------------------------------------- totals ------------
  private totals(): void {
    const { doc, rec, spec, m } = this;
    if (spec.type === 'RR') {
      const units = spec.lines.reduce((s, l) => s + l.qty, 0);
      rec.text(
        undefined,
        `Lines: ${spec.lines.length}    Total units received: ${units}`,
        LEFT,
        this.y + 12,
        { size: 8.5 },
      );
      this.y += 30;
      return;
    }
    const rows: [string, string, string][] = [['Subtotal', spec.subtotal!, 'subtotal']];
    if (spec.tax !== undefined) rows.push([spec.taxLabel ?? 'Tax', spec.tax, 'tax']);
    if (spec.shipping !== undefined)
      rows.push([this.family === 'erp' ? 'Freight' : 'Shipping', spec.shipping, 'shipping']);
    rows.push([
      spec.type === 'PO' ? 'PO Total' : this.family === 'erp' ? 'TOTAL DUE' : 'Total Due',
      spec.total!,
      'total',
    ]);

    const needed = rows.length * 18 + 30;
    if (this.y + needed > BOTTOM) this.newPage(false);
    let y = this.y + 12;
    if (this.family === 'erp') {
      this.rule('-', this.y + 2, m.body);
      y += 4;
    }
    const lx = 352;
    const vx = 462;
    if (this.family === 'classic')
      doc
        .rect(lx - 8, y - 6, RIGHT - lx + 8, rows.length * 18 + 8)
        .lineWidth(0.6)
        .stroke(LIGHT);
    rows.forEach(([label, value, field], i) => {
      const isTotal = i === rows.length - 1;
      const size = isTotal && this.family === 'modern' ? 13 : 9;
      const color =
        isTotal && (this.family === 'modern' || this.family === 'letterhead')
          ? this.style.accent
          : '#111111';
      if (this.family === 'boxed')
        doc
          .rect(lx - 6, y - 4, RIGHT - lx + 6, 18)
          .lineWidth(0.8)
          .stroke('#374151');
      if (this.family === 'twocol')
        doc
          .rect(lx - 6, y - 4, RIGHT - lx + 6, 18)
          .fillAndStroke(isTotal ? '#e5e7eb' : '#ffffff', LIGHT);
      if (this.family === 'letterhead') {
        const w = rec.text(undefined, label, lx - 40, y, { size, font: isTotal ? 'B' : 'R' });
        doc.font('R').fontSize(size);
        const dots = '.'.repeat(
          Math.max(2, Math.floor((vx - (lx - 40) - w - 6) / doc.widthOfString('.'))),
        );
        rec.text(undefined, dots, lx - 40 + w + 3, y, { size, color: GREY });
      } else {
        rec.text(undefined, this.family === 'erp' ? label.toUpperCase() : label, lx, y, {
          size: 8.5,
          font: isTotal ? 'B' : 'R',
          width: 105,
          fit: true,
        });
      }
      rec.text(field, money(value, m.dollar), vx, y - (size - 9) / 2, {
        size,
        font: isTotal ? 'B' : 'R',
        color,
        width: RIGHT - vx - 4,
        align: 'right',
      });
      y += 18;
    });
    this.y = y + 10;
  }

  private footer(): void {
    const { doc, rec, spec } = this;
    if (spec.note && this.y + 30 < BOTTOM + 30) {
      rec.text(undefined, spec.note, LEFT, Math.max(this.y + 10, 690), {
        size: 7.5,
        color: GREY,
        width: RIGHT - LEFT,
        fit: true,
      });
    }
    const range = doc.bufferedPageRange();
    if (spec.stamp) {
      doc.switchToPage(range.start);
      doc.save();
      doc.rotate(-16, { origin: [440, 70] });
      doc.lineWidth(2).rect(395, 52, 110, 34).stroke('#b91c1c');
      rec.text(undefined, spec.stamp, 395, 60, {
        font: 'B',
        size: 18,
        color: '#b91c1c',
        width: 110,
        align: 'center',
      });
      doc.restore();
    }
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      rec.text(undefined, `Page ${i + 1} of ${range.count}`, LEFT, PAGE_H - 40, {
        size: 7,
        color: GREY,
        width: RIGHT - LEFT,
        align: 'right',
      });
    }
  }

  async render(): Promise<{ bytes: Buffer; pages: number; fields: DocumentFields }> {
    this.header();
    this.tableHeader();
    this.spec.lines.forEach((line, i) => this.row(line, i));
    this.totals();
    this.footer();
    const pages = this.doc.bufferedPageRange().count;

    const bytes = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.doc.on('data', (c: Buffer) => chunks.push(c));
      this.doc.on('end', () => resolve(Buffer.concat(chunks)));
      this.doc.on('error', reject);
      this.doc.end();
    });
    return { bytes, pages, fields: this.truthFields() };
  }

  private truthFields(): DocumentFields {
    const { spec, rec } = this;
    const at = (f: string) => rec.location(f);
    const has = (f: string) => rec.fields.has(f);
    const val = <T>(value: T, f: string) => ({ value, ...at(f) });
    return {
      vendorName: val(spec.vendorName, 'vendorName'),
      docNumber: val(spec.docNumber, 'docNumber'),
      ...(spec.poNumber ? { poNumber: val(spec.poNumber, 'poNumber') } : {}),
      date: val(spec.date, 'date'),
      ...(spec.dueDate ? { dueDate: val(spec.dueDate, 'dueDate') } : {}),
      ...(has('currency') ? { currency: val('USD' as const, 'currency') } : {}),
      lines: spec.lines.map((l, i) => ({
        lineNo: l.lineNo,
        ...(l.sku ? { sku: val(l.sku, `lines.${i}.sku`) } : {}),
        description: val(l.description, `lines.${i}.description`),
        qty: val(l.qty, `lines.${i}.qty`),
        uom: val(l.uom, `lines.${i}.uom`),
        ...(l.unitPrice ? { unitPrice: val(l.unitPrice, `lines.${i}.unitPrice`) } : {}),
        ...(l.lineTotal ? { lineTotal: val(l.lineTotal, `lines.${i}.lineTotal`) } : {}),
      })),
      ...(spec.subtotal ? { subtotal: val(spec.subtotal, 'subtotal') } : {}),
      ...(spec.tax ? { tax: val(spec.tax, 'tax') } : {}),
      ...(spec.shipping ? { shipping: val(spec.shipping, 'shipping') } : {}),
      ...(spec.total ? { total: val(spec.total, 'total') } : {}),
    };
  }
}

/** Render one document to PDF and return the field locations recorded while drawing. */
export function renderPdf(spec: DocSpec) {
  return new Renderer(spec, spec.style).render();
}
