import { Decimal, lineKey, PlantedErrorType, toCents, type PlantedError } from '@reconcile/core';
import {
  ABBREVIATIONS,
  VENDOR_PRODUCT_NAMES,
  VENDOR_VARIANT_WORDS,
  VENDORS,
} from './catalog/data.ts';
import type { Catalog, CatalogItem, VendorProfile } from './catalog/index.ts';
import { LINE_ERRORS, NEEDS_COMPLETE_SET, type Rates } from './config.ts';
import { addDays, EPOCH } from './dates.ts';
import { PRICE_TOLERANCE } from './truth.ts';
import type { DocSpec, LineLink, LineSpec, SetSpec } from './model.ts';
import { Rng } from './rng.ts';

/** Per-PO-line state that planted errors mutate before documents are derived. */
interface WorkLine {
  item: CatalogItem;
  ordered: number;
  received: number;
  billed: number;
  poPrice: string;
  invPrice: string;
  rrDescription: string;
  invDescription: string;
  invSkuOmitted: boolean;
}

const CARRIERS = ['XPO Logistics', 'Old Dominion', 'Estes Express', 'R+L Carriers', 'Saia LTL'];
const RECEIVERS = ['M. Chen', 'D. Alvarez', 'K. Johnson', 'P. Nguyen', 'S. Patel'];
const BUYERS = ['J. Okafor', 'L. Brennan', 'T. Moreau'];

export const setIdFor = (index: number) => `S${String(index + 1).padStart(4, '0')}`;

/** Abbreviate up to two known words and maybe add one character-level typo. Never a no-op. */
export function mutateDescription(rng: Rng, text: string): string {
  let out = text;
  const candidates = rng.shuffle(Object.keys(ABBREVIATIONS).filter((w) => out.includes(w)));
  for (const word of candidates.slice(0, rng.int(1, 2))) {
    out = out.replace(word, ABBREVIATIONS[word]!);
  }
  if (out === text || rng.chance(0.5)) {
    const words = out.split(' ');
    const idx = words.findIndex((w, i) => i > 0 && /^[A-Za-z]{4,}$/.test(w));
    if (idx > 0) {
      const w = words[idx]!;
      const p = rng.int(1, w.length - 2);
      words[idx] = rng.chance(0.5)
        ? w.slice(0, p) + w[p + 1] + w[p] + w.slice(p + 2) // swap adjacent letters
        : w.slice(0, p) + w.slice(p + 1); // drop a letter
      out = words.join(' ');
    }
  }
  return out === text ? `${text.replace(/,.*$/, '')} (${text.split(', ')[1] ?? 'ea'})` : out;
}

/** Share of SKU-less invoice lines that are also reworded (B-16, generator 0.4.0). */
export const SKU_OMITTED_REWORD_RATE = 0.6;
/** Share of `sku_omitted` sets where the vendor prints no SKUs on the whole invoice. */
export const SKU_OMITTED_WHOLE_INVOICE_RATE = 0.3;

/** "Sunpeak Crunchy Almond Butter, 12 oz" -> "Sunpeak Almond Butter Crunchy, 12 oz". */
export function vendorWordOrder(description: string, brand: string): string {
  const [head = '', size] = description.split(/, (?=[^,]*$)/);
  const rest = head.startsWith(`${brand} `)
    ? head.slice(brand.length + 1).split(' ')
    : head.split(' ');
  if (rest.length < 2) return description.toUpperCase();
  const reordered = [...rest.slice(1), rest[0]].join(' ');
  return `${brand} ${reordered}${size ? `, ${size}` : ''}`;
}

/**
 * "Sunpeak Crunchy Almond Butter, 12 oz" -> "Chunky Nut Spread, Almond, 12 oz".
 * Returns undefined when the product has no vendor names on file.
 */
export function vendorProductName(
  rng: Rng,
  description: string,
  vendorCode: string,
): string | undefined {
  const spec = VENDORS.find((v) => v.code === vendorCode);
  if (!spec) return undefined;
  const [head = '', size] = description.split(/, (?=[^,]*$)/);
  const product = spec.products.find((p) => head.endsWith(` ${p.name}`));
  const names = product ? VENDOR_PRODUCT_NAMES[product.name] : undefined;
  if (!product || !names) return undefined;
  let variant = head.slice(spec.brand.length + 1, head.length - product.name.length - 1).trim();
  for (const [from, to] of Object.entries(VENDOR_VARIANT_WORDS)) {
    variant = variant.replace(new RegExp(`\\b${from}\\b`), to);
  }
  // A vendor's own invoice rarely repeats its brand on every line; variant first, as many ERPs print.
  return `${variant ? `${variant} ` : ''}${rng.pick(names)}${size ? `, ${size}` : ''}`;
}

function chooseErrors(rng: Rng, rates: Rates): PlantedErrorType[] {
  if (rng.chance(rates.cleanSetRate)) return [];
  const types = PlantedErrorType.options;
  let chosen = types.filter((t) => rng.chance(rates.errors[t]));
  if (chosen.length === 0) {
    const weighted = types.map((t) => [t, rates.errors[t]] as const).filter(([, w]) => w > 0);
    if (weighted.length === 0) return [];
    chosen = [rng.weighted(weighted)];
  }
  // An incomplete set can't be 3-way matched, so errors that need matching would be unobservable.
  // Only description/SKU noise survives alongside a missing document.
  if (chosen.includes('missing_document')) {
    chosen = chosen.filter((t) => t === 'missing_document' || !NEEDS_COMPLETE_SET.has(t));
  }
  return chosen;
}

function lineCount(rng: Rng, available: number): number {
  // Skewed toward short orders, bounded by the vendor's catalog size (13-14 SKUs). One SKU is
  // always left unordered so an "extra invoice line" can be planted.
  return Math.min(available - 1, 1 + Math.floor(Math.pow(rng.float(), 1.4) * 24));
}

function invoiceNumber(rng: Rng, vendor: VendorProfile): string {
  const n = rng.int(10 ** (vendor.invoiceDigits - 1), 10 ** vendor.invoiceDigits - 1);
  return `${vendor.invoicePrefix}${n}`;
}

export function buildSet(catalog: Catalog, rates: Rates, seed: number, index: number): SetSpec {
  const rng = new Rng(seed).fork(`set:${index}`);
  const setId = setIdFor(index);
  const vendor = rng.pick(catalog.vendors);
  const vendorItems = catalog.items.filter((i) => i.vendorCode === vendor.code);
  const chosenItems = rng.sample(vendorItems, lineCount(rng, vendorItems.length));
  const maxQty = vendor.uom === 'EA' ? 144 : 60;

  const work: WorkLine[] = chosenItems.map((item) => {
    const ordered = rng.int(2, maxQty);
    return {
      item,
      ordered,
      received: ordered,
      billed: ordered,
      poPrice: item.unitPrice,
      invPrice: item.unitPrice,
      rrDescription: item.description,
      invDescription: item.description,
      invSkuOmitted: false,
    };
  });

  // ---- plant errors -------------------------------------------------------------------
  const planted: PlantedError[] = [];
  const chosen = chooseErrors(rng.fork('errors'), rates);
  const plantRng = rng.fork('plant');
  const freeLines = plantRng.shuffle(work.map((_, i) => i));
  const plantedLineIndex: number[] = []; // work-line index of each line-level planted error

  for (const type of LINE_ERRORS) {
    if (!chosen.includes(type)) continue;
    const i = freeLines.pop();
    if (i === undefined) continue; // more line errors than lines: drop the extra
    plantedLineIndex.push(i);
    const w = work[i]!;
    const o = w.ordered;
    const details: PlantedError['details'] = {};
    switch (type) {
      case 'short_ship_billed_full':
      case 'short_ship_billed_correctly': {
        const k = plantRng.int(1, Math.max(1, Math.floor(o / 2)));
        w.received = o - k;
        w.billed = type === 'short_ship_billed_full' ? o : o - k;
        Object.assign(details, { ordered: o, received: w.received, billed: w.billed });
        break;
      }
      case 'over_ship': {
        const k = plantRng.int(1, Math.max(1, Math.floor(o * 0.3)));
        w.received = o + k;
        w.billed = plantRng.chance(0.5) ? w.received : o;
        Object.assign(details, { ordered: o, received: w.received, billed: w.billed });
        break;
      }
      case 'billed_not_received': {
        const k = plantRng.int(1, Math.max(1, Math.floor(o * 0.3)));
        w.billed = o + k;
        Object.assign(details, { ordered: o, received: w.received, billed: w.billed });
        break;
      }
      case 'price_change': {
        const po = new Decimal(w.poPrice);
        const sign = plantRng.chance(0.75) ? 1 : -1;
        let inv = new Decimal(toCents(po.times(1 + sign * plantRng.range(0.02, 0.15))));
        const minDiff = Decimal.max('0.01', po.times('0.005'));
        if (inv.minus(po).abs().lessThan(minDiff)) inv = po.plus(minDiff.times(sign).times(2));
        w.invPrice = toCents(inv);
        Object.assign(details, { poPrice: w.poPrice, invoicePrice: w.invPrice });
        break;
      }
      case 'description_typo': {
        const onInvoice = plantRng.chance(0.7);
        const mutated = mutateDescription(plantRng, w.item.description);
        if (onInvoice) w.invDescription = mutated;
        else w.rrDescription = mutated;
        Object.assign(details, {
          document: onInvoice ? 'inv-1' : 'rr',
          original: w.item.description,
          mutated,
        });
        break;
      }
      case 'sku_omitted': {
        // B-16: some vendors print no SKUs at all, and use their own wording. Several SKU-less
        // lines in one invoice force the matcher to choose between similar descriptions.
        const wholeInvoice = plantRng.chance(SKU_OMITTED_WHOLE_INVOICE_RATE);
        const targets = wholeInvoice ? work : [w];
        let reworded = 0;
        for (const t of targets) {
          t.invSkuOmitted = true;
          if (plantRng.chance(SKU_OMITTED_REWORD_RATE)) {
            t.invDescription = plantRng.chance(0.5)
              ? mutateDescription(plantRng, t.invDescription)
              : vendorWordOrder(t.invDescription, vendor.brand);
            reworded++;
          }
        }
        Object.assign(details, {
          sku: w.item.sku,
          linesWithoutSku: targets.length,
          reworded,
          ...(w.invDescription !== w.item.description ? { primaryReworded: w.invDescription } : {}),
        });
        break;
      }
      case 'vendor_name': {
        // M4 AC-15: the vendor's own wording for the product, and no SKU. Size and unit stay.
        const renamed = vendorProductName(plantRng, w.item.description, vendor.code);
        if (renamed) {
          w.invSkuOmitted = true;
          w.invDescription = renamed;
          Object.assign(details, { original: w.item.description, vendorName: renamed });
        }
        break;
      }
      case 'price_noise': {
        // A near miss: a few cents off, but inside the default tolerance, so no exception.
        const po = new Decimal(w.poPrice);
        const tolerance = Decimal.max(PRICE_TOLERANCE.abs, po.times(PRICE_TOLERANCE.pct));
        const maxCents = Math.max(1, tolerance.times(80).floor().toNumber());
        const k = plantRng.int(1, maxCents);
        const sign = plantRng.chance(0.5) || po.lessThanOrEqualTo('0.05') ? 1 : -1;
        w.invPrice = toCents(po.plus(new Decimal(k).dividedBy(100).times(sign)));
        Object.assign(details, { poPrice: w.poPrice, invoicePrice: w.invPrice });
        break;
      }
    }
    planted.push({ type, lineKeys: [], details }); // keys filled in once line numbers exist
  }

  let extra: { item: CatalogItem; qty: number; position: number } | undefined;
  if (chosen.includes('extra_invoice_line')) {
    const unused = vendorItems.filter((i) => !chosenItems.includes(i));
    if (unused.length > 0) {
      extra = {
        item: plantRng.pick(unused),
        qty: plantRng.int(1, 12),
        position: plantRng.int(0, work.length),
      };
    }
  }
  const missingRole = chosen.includes('missing_document')
    ? plantRng.weighted([
        ['rr', 0.45],
        ['inv-1', 0.35],
        ['po', 0.2],
      ] as const)
    : undefined;
  const duplicate = chosen.includes('duplicate_invoice');

  // ---- header facts ------------------------------------------------------------------
  const hdr = rng.fork('header');
  const poNumber = `HP-PO-${104000 + index * 17 + hdr.int(0, 16)}`;
  const rrNumber = `RCV-${500000 + index * 31 + hdr.int(0, 30)}`;
  const invNumber = invoiceNumber(hdr, vendor);
  const poDate = addDays(EPOCH, hdr.int(0, 270));
  const rrDate = addDays(poDate, hdr.int(3, 14));
  const invDate = addDays(rrDate, hdr.int(-2, 4));
  const dupDate = addDays(invDate, hdr.int(7, 30));
  const dcIndex = hdr.int(0, catalog.buyer.shipTo.length - 1);
  const shipTo = catalog.buyer.shipTo[dcIndex]!;
  const [dcName, ...dcAddress] = shipTo.split(', ');

  // ---- derive documents ----------------------------------------------------------------
  const poLines: LineSpec[] = work.map((w, i) => ({
    lineNo: i + 1,
    sku: w.item.sku,
    description: w.item.description,
    qty: w.ordered,
    uom: w.item.uom,
    unitPrice: w.poPrice,
    lineTotal: toCents(new Decimal(w.poPrice).times(w.ordered)),
  }));

  // Warehouse systems list lines by SKU, not in PO order.
  const rrOrder = work
    .map((_, i) => i)
    .sort((a, b) => work[a]!.item.sku.localeCompare(work[b]!.item.sku));
  const rrLineOf = new Map(rrOrder.map((wi, pos) => [wi, pos + 1]));
  const rrLines: LineSpec[] = rrOrder.map((wi, pos) => {
    const w = work[wi]!;
    return {
      lineNo: pos + 1,
      sku: w.item.sku,
      description: w.rrDescription,
      qty: w.received,
      uom: w.item.uom,
    };
  });

  const invEntries: ({ kind: 'po'; wi: number } | { kind: 'extra' })[] = work.map((_, wi) => ({
    kind: 'po',
    wi,
  }));
  if (extra) invEntries.splice(extra.position, 0, { kind: 'extra' });
  const invLineOf = new Map<number, number>();
  let extraInvLine: number | undefined;
  const invLines: LineSpec[] = invEntries.map((e, pos) => {
    const lineNo = pos + 1;
    if (e.kind === 'extra') {
      extraInvLine = lineNo;
      const { item, qty } = extra!;
      return {
        lineNo,
        sku: item.sku,
        description: item.description,
        qty,
        uom: item.uom,
        unitPrice: item.unitPrice,
        lineTotal: toCents(new Decimal(item.unitPrice).times(qty)),
      };
    }
    const w = work[e.wi]!;
    invLineOf.set(e.wi, lineNo);
    return {
      lineNo,
      ...(w.invSkuOmitted ? {} : { sku: w.item.sku }),
      description: w.invDescription,
      qty: w.billed,
      uom: w.item.uom,
      unitPrice: w.invPrice,
      lineTotal: toCents(new Decimal(w.invPrice).times(w.billed)),
    };
  });

  const sum = (lines: LineSpec[]) =>
    toCents(lines.reduce((s, l) => s.plus(l.lineTotal ?? 0), new Decimal(0)));
  const poSubtotal = sum(poLines);
  const invSubtotal = sum(invLines);
  const tax = toCents(new Decimal(invSubtotal).times(vendor.taxRate));
  const invTotal = toCents(new Decimal(invSubtotal).plus(tax).plus(vendor.shippingFee));
  const taxPct = new Decimal(vendor.taxRate).times(100).toDecimalPlaces(2).toString();

  const po: DocSpec = {
    role: 'po',
    type: 'PO',
    title: 'PURCHASE ORDER',
    style: catalog.poStyle,
    docNumber: poNumber,
    docNumberLabel: 'PO Number',
    date: poDate,
    dateLabel: 'Order Date',
    vendorName: vendor.name,
    from: [catalog.buyer.name, catalog.buyer.address],
    parties: [
      { label: 'Vendor', lines: [vendor.name, vendor.address] },
      { label: 'Ship To', lines: [dcName!, dcAddress.join(', ')] },
    ],
    extras: [
      ['Terms', `Net ${vendor.termsDays}`],
      ['Buyer', hdr.pick(BUYERS)],
    ],
    lines: poLines,
    subtotal: poSubtotal,
    total: poSubtotal,
    note: 'Please reference the PO number on all invoices and shipping documents.',
  };

  const rr: DocSpec = {
    role: 'rr',
    type: 'RR',
    title: 'RECEIVING REPORT',
    style: catalog.rrStyles[dcIndex]!,
    docNumber: rrNumber,
    docNumberLabel: 'Receipt #',
    poNumber,
    date: rrDate,
    dateLabel: 'Date Received',
    vendorName: vendor.name,
    from: [`${catalog.buyer.name}`, shipTo],
    parties: [{ label: 'Vendor', lines: [vendor.name] }],
    extras: [
      ['Carrier', hdr.pick(CARRIERS)],
      ['BOL #', String(hdr.int(10_000_000, 99_999_999))],
      ['Received By', hdr.pick(RECEIVERS)],
    ],
    lines: rrLines,
  };

  const invoiceBase: Omit<DocSpec, 'role' | 'date' | 'dueDate'> = {
    type: 'INVOICE',
    title: 'INVOICE',
    style: vendor.style,
    docNumber: invNumber,
    docNumberLabel: hdr.pick(['Invoice #', 'Invoice No.', 'Invoice Number']),
    poNumber,
    dateLabel: 'Invoice Date',
    vendorName: vendor.name,
    from: [vendor.name, vendor.address],
    parties: [
      { label: 'Bill To', lines: [catalog.buyer.name, catalog.buyer.address] },
      { label: 'Ship To', lines: [dcName!, dcAddress.join(', ')] },
    ],
    extras: [['Terms', `Net ${vendor.termsDays}`]],
    lines: invLines,
    subtotal: invSubtotal,
    tax,
    taxLabel: vendor.taxRate === '0.0000' ? 'Tax (resale exempt)' : `Sales Tax (${taxPct}%)`,
    shipping: vendor.shippingFee,
    total: invTotal,
    note: `Thank you for your business. Remit to ${vendor.name}.`,
  };
  const inv1: DocSpec = {
    ...invoiceBase,
    role: 'inv-1',
    date: invDate,
    dueDate: addDays(invDate, vendor.termsDays),
  };
  const inv2: DocSpec | undefined = duplicate
    ? {
        ...invoiceBase,
        role: 'inv-2',
        date: dupDate,
        dueDate: addDays(dupDate, vendor.termsDays),
        ...(hdr.chance(0.5) ? { stamp: 'RE-SENT' } : {}),
      }
    : undefined;

  // ---- line links and planted-error keys -------------------------------------------
  const links: LineLink[] = work.map((_, wi) => ({
    po: wi + 1,
    rr: rrLineOf.get(wi)!,
    inv: invLineOf.get(wi)!,
  }));
  if (extraInvLine !== undefined) links.push({ inv: extraInvLine });

  const keysFor = (link: LineLink) => [
    ...(link.po !== undefined ? [lineKey('po', link.po)] : []),
    ...(link.rr !== undefined ? [lineKey('rr', link.rr)] : []),
    ...(link.inv !== undefined ? [lineKey('inv-1', link.inv)] : []),
  ];
  plantedLineIndex.forEach((wi, p) => {
    planted[p]!.lineKeys = keysFor(links[wi]!);
  });
  if (extra && extraInvLine !== undefined) {
    planted.push({
      type: 'extra_invoice_line',
      lineKeys: [lineKey('inv-1', extraInvLine)],
      details: { sku: extra.item.sku, qty: extra.qty },
    });
  }
  if (missingRole)
    planted.push({ type: 'missing_document', lineKeys: [], details: { missing: missingRole } });
  if (inv2)
    planted.push({
      type: 'duplicate_invoice',
      lineKeys: [],
      details: { invoiceNumber: invNumber },
    });

  const docs = [po, rr, inv1, ...(inv2 ? [inv2] : [])].filter((d) => d.role !== missingRole);
  const missingSide = missingRole === 'inv-1' ? 'inv' : missingRole;
  const presentLinks = links
    .map((l) => (missingSide ? { ...l, [missingSide]: undefined } : l))
    .map(
      (l) => Object.fromEntries(Object.entries(l).filter(([, v]) => v !== undefined)) as LineLink,
    )
    .filter((l) => Object.keys(l).length > 0);

  return {
    setId,
    seed,
    poNumber,
    vendor,
    docs,
    ...(missingRole ? { missingRole } : {}),
    links: presentLinks,
    planted: planted.map((pe) => ({
      ...pe,
      lineKeys: pe.lineKeys.filter((k) => !missingRole || !k.startsWith(`${missingRole}:`)),
    })),
  };
}
