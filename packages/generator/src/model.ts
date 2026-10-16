import type { DocType, PlantedError } from '@reconcile/core';
import type { DocStyle, VendorProfile } from './catalog/index.ts';

/** One line as it appears on one document. */
export interface LineSpec {
  lineNo: number;
  /** Absent when the SKU is omitted on this document. */
  sku?: string;
  description: string;
  qty: number;
  uom: string;
  /** Absent on receiving reports. */
  unitPrice?: string;
  lineTotal?: string;
}

export type Role = 'po' | 'rr' | 'inv-1' | 'inv-2';

/** Everything needed to render one document and describe it in the answer key. */
export interface DocSpec {
  role: Role;
  type: DocType;
  title: string;
  style: DocStyle;
  docNumber: string;
  docNumberLabel: string;
  poNumber?: string;
  date: string;
  dateLabel: string;
  dueDate?: string;
  vendorName: string;
  /** Issuer block (top-left / letterhead). */
  from: readonly string[];
  /** Parties: e.g. Bill To, Ship To, Vendor. */
  parties: readonly { label: string; lines: readonly string[] }[];
  /** Extra header facts that aren't extracted fields (terms, carrier…). */
  extras: readonly (readonly [string, string])[];
  lines: LineSpec[];
  subtotal?: string;
  tax?: string;
  taxLabel?: string;
  shipping?: string;
  total?: string;
  /** Stamp text such as "DUPLICATE COPY", shown on re-sent invoices. */
  stamp?: string;
  /** Footer note. */
  note?: string;
}

/** Line numbers of the same logical line across documents (absent = not on that document). */
export interface LineLink {
  po?: number;
  rr?: number;
  inv?: number;
}

export interface SetSpec {
  setId: string;
  seed: number;
  poNumber: string;
  vendor: VendorProfile;
  /** Documents that exist (a planted missing document is simply absent). */
  docs: DocSpec[];
  missingRole?: 'po' | 'rr' | 'inv-1';
  links: LineLink[];
  planted: PlantedError[];
}
