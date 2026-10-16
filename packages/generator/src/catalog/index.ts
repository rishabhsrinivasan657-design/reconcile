import { toCents } from '@reconcile/core';
import type { DateFormat } from '../dates.ts';
import { Rng } from '../rng.ts';
import { BUYER, VENDORS, type VendorSpec } from './data.ts';

export { BUYER } from './data.ts';

/** Default catalog seed. The catalog is independent of the document seed, so the DB seed matches. */
export const CATALOG_SEED = 42;

export const TEMPLATE_FAMILIES = [
  'classic',
  'modern',
  'erp',
  'twocol',
  'boxed',
  'letterhead',
] as const;
export type TemplateFamily = (typeof TEMPLATE_FAMILIES)[number];

export type FontKey =
  | 'inter'
  | 'plex-sans'
  | 'roboto-mono'
  | 'source-code-pro'
  | 'source-serif'
  | 'roboto-condensed'
  | 'lato'
  | 'helvetica'
  | 'times'
  | 'courier';

export type Column = 'sku' | 'description' | 'qty' | 'uom' | 'unitPrice' | 'lineTotal';
export type ColumnLabels = Record<Column, string>;

/** How one party's documents look. Vendors style their invoices; the buyer styles POs and RRs. */
export interface DocStyle {
  family: TemplateFamily;
  font: FontKey;
  boldFont: FontKey;
  accent: string;
  dateFormat: DateFormat;
  labels: ColumnLabels;
  columns: readonly Column[];
}

export interface VendorProfile {
  code: string;
  name: string;
  brand: string;
  category: string;
  address: string;
  uom: 'CS' | 'EA';
  style: DocStyle;
  invoicePrefix: string;
  invoiceDigits: number;
  /** Decimal string, e.g. "0.0000" for resale-exempt or "0.0625". */
  taxRate: string;
  shippingFee: string;
  termsDays: 30 | 45 | 60;
}

export interface CatalogItem {
  vendorCode: string;
  sku: string;
  description: string;
  uom: 'CS' | 'EA';
  packSize: number;
  /** Price per unit of measure, 2-decimal string (ADR-0004). */
  unitPrice: string;
}

export interface Catalog {
  buyer: typeof BUYER;
  vendors: VendorProfile[];
  items: CatalogItem[];
  /** Buyer-side styles: the PO comes from the buyer's ERP, the RR from the warehouse system. */
  poStyle: DocStyle;
  rrStyles: readonly DocStyle[];
}

const FONT_PAIRS: Record<TemplateFamily, readonly (readonly [FontKey, FontKey])[]> = {
  classic: [
    ['helvetica', 'helvetica'],
    ['lato', 'lato'],
    ['inter', 'inter'],
  ],
  modern: [
    ['inter', 'inter'],
    ['plex-sans', 'plex-sans'],
    ['lato', 'lato'],
  ],
  erp: [
    ['roboto-mono', 'roboto-mono'],
    ['courier', 'courier'],
    ['source-code-pro', 'source-code-pro'],
  ],
  twocol: [
    ['roboto-condensed', 'roboto-condensed'],
    ['plex-sans', 'plex-sans'],
    ['helvetica', 'helvetica'],
  ],
  boxed: [
    ['roboto-condensed', 'roboto-condensed'],
    ['helvetica', 'helvetica'],
    ['lato', 'lato'],
  ],
  letterhead: [
    ['source-serif', 'source-serif'],
    ['times', 'times'],
    ['source-serif', 'source-serif'],
  ],
};

const ACCENTS = ['#1f4e79', '#7a1f3d', '#2e6b30', '#8a5a00', '#3b3b98', '#00646e', '#5b2a86'];
const DATE_FORMATS: readonly DateFormat[] = [
  'MM/DD/YYYY',
  'YYYY-MM-DD',
  'DD-MMM-YYYY',
  'MMMM D, YYYY',
];
const COLUMN_ORDERS: readonly (readonly Column[])[] = [
  ['sku', 'description', 'qty', 'uom', 'unitPrice', 'lineTotal'],
  ['qty', 'uom', 'sku', 'description', 'unitPrice', 'lineTotal'],
  ['description', 'sku', 'uom', 'qty', 'unitPrice', 'lineTotal'],
];
const LABEL_CHOICES: Record<Column, readonly string[]> = {
  sku: ['Item #', 'SKU', 'Product Code', 'Item No.', 'Vendor SKU'],
  description: ['Description', 'Item Description', 'Product'],
  qty: ['Qty', 'Quantity', 'Units', 'Qty Shipped'],
  uom: ['UOM', 'Unit', 'U/M'],
  unitPrice: ['Unit Price', 'Price', 'Rate', 'Price/Unit'],
  lineTotal: ['Amount', 'Ext. Price', 'Line Total', 'Total'],
};

function pickLabels(rng: Rng): ColumnLabels {
  return {
    sku: rng.pick(LABEL_CHOICES.sku),
    description: rng.pick(LABEL_CHOICES.description),
    qty: rng.pick(LABEL_CHOICES.qty),
    uom: rng.pick(LABEL_CHOICES.uom),
    unitPrice: rng.pick(LABEL_CHOICES.unitPrice),
    lineTotal: rng.pick(LABEL_CHOICES.lineTotal),
  };
}

const SKU_STYLES = ['dash', 'suffix', 'compact'] as const;

function formatSku(
  style: (typeof SKU_STYLES)[number],
  vendor: VendorSpec,
  n: number,
  pack: number,
) {
  switch (style) {
    case 'dash':
      return `${vendor.code.slice(0, 2)}-${n}`;
    case 'suffix':
      return `${n}-${String(pack).padStart(2, '0')}`;
    case 'compact':
      return `${vendor.code}${n}`;
  }
}

/** ~13 SKUs per vendor, 200 in total. */
function itemsPerVendor(index: number): number {
  return index < 5 ? 14 : 13;
}

export function buildCatalog(seed = CATALOG_SEED): Catalog {
  const root = new Rng(seed);
  const vendors: VendorProfile[] = [];
  const items: CatalogItem[] = [];

  VENDORS.forEach((spec, i) => {
    const rng = root.fork(`vendor:${spec.code}`);
    const family = TEMPLATE_FAMILIES[i % TEMPLATE_FAMILIES.length]!;
    const [font, boldFont] = FONT_PAIRS[family][Math.floor(i / TEMPLATE_FAMILIES.length)]!;
    const skuStyle = SKU_STYLES[i % SKU_STYLES.length]!;

    vendors.push({
      code: spec.code,
      name: spec.name,
      brand: spec.brand,
      category: spec.category,
      address: spec.address,
      uom: spec.uom,
      style: {
        family,
        font,
        boldFont,
        accent: ACCENTS[i % ACCENTS.length]!,
        dateFormat: DATE_FORMATS[i % DATE_FORMATS.length]!,
        labels: pickLabels(rng),
        columns: COLUMN_ORDERS[i % COLUMN_ORDERS.length]!,
      },
      invoicePrefix: rng.pick([`${spec.code}-`, 'INV-', `${spec.code.slice(0, 2)}`, '']),
      invoiceDigits: rng.pick([5, 6, 7]),
      taxRate: rng.pick(['0.0000', '0.0000', '0.0500', '0.0625', '0.0700']),
      shippingFee: rng.pick(['0.00', '25.00', '45.00', '75.00', '120.00']),
      termsDays: rng.pick([30, 30, 45, 60] as const),
    });

    const combos = spec.products.flatMap((p) =>
      p.variants.flatMap((variant) =>
        p.sizes.map(([size, factor]) => ({ p, variant, size, factor })),
      ),
    );
    const count = itemsPerVendor(i);
    if (combos.length < count) {
      throw new Error(`${spec.code} has ${combos.length} product combos, needs ${count}`);
    }
    const skuNumbers = rng.sample(
      Array.from({ length: 900 }, (_, k) => 10000 + i * 1000 + k),
      count,
    );
    rng.sample(combos, count).forEach((c, k) => {
      const jitter = rng.range(0.92, 1.08);
      items.push({
        vendorCode: spec.code,
        sku: formatSku(skuStyle, spec, skuNumbers[k]!, c.p.packSize),
        description: `${spec.brand} ${c.variant} ${c.p.name}, ${c.size}`,
        uom: spec.uom,
        packSize: c.p.packSize,
        unitPrice: toCents(c.p.basePrice * c.factor * jitter),
      });
    });
  });

  const buyerRng = root.fork('buyer');
  return {
    buyer: BUYER,
    vendors,
    items,
    poStyle: {
      family: 'classic',
      font: 'helvetica',
      boldFont: 'helvetica',
      accent: '#14532d',
      dateFormat: 'MM/DD/YYYY',
      labels: {
        sku: 'Vendor Item #',
        description: 'Description',
        qty: 'Order Qty',
        uom: 'UOM',
        unitPrice: 'Unit Cost',
        lineTotal: 'Ext. Cost',
      },
      columns: ['sku', 'description', 'qty', 'uom', 'unitPrice', 'lineTotal'],
    },
    rrStyles: [
      {
        family: 'boxed',
        font: 'roboto-condensed',
        boldFont: 'roboto-condensed',
        accent: '#334155',
        dateFormat: 'YYYY-MM-DD',
        labels: { ...pickLabels(buyerRng), qty: 'Qty Received' },
        columns: ['sku', 'description', 'uom', 'qty', 'unitPrice', 'lineTotal'],
      },
      {
        family: 'erp',
        font: 'courier',
        boldFont: 'courier',
        accent: '#000000',
        dateFormat: 'DD-MMM-YYYY',
        labels: { ...pickLabels(buyerRng), qty: 'Rcvd' },
        columns: ['qty', 'uom', 'sku', 'description', 'unitPrice', 'lineTotal'],
      },
    ],
  };
}
