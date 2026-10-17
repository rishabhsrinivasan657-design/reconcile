import type { ExceptionType } from '../schemas/enums.ts';
import type { ExtractedLine } from '../schemas/extracted.ts';

export interface LineRef {
  docId: string;
  lineNo: number;
}

export type DocRoleInGroup = 'po' | 'rr' | 'invoice' | 'duplicate';

export interface LineMatch {
  po?: LineRef;
  rr?: LineRef;
  inv?: LineRef;
  method: 'SKU' | 'FUZZY';
  /** Fuzzy pairs only: similarity in [0,1] and a human-readable reason. */
  confidence?: number;
  reason?: string;
}

export interface MatchException {
  type: ExceptionType;
  lines: LineRef[];
  documentIds: string[];
  /** MISSING_DOCUMENT only: which document is missing. */
  missing?: 'po' | 'rr' | 'invoice';
  /** FR-09 dollar impact, 2-decimal string; "0.00" when informational. */
  amount: string;
  informational: boolean;
  explanation: string;
}

export interface MatchGroup {
  poNumber: string;
  /** Plain-English notes about assumptions (e.g. a misread PO number was tolerated). */
  notes: string[];
  documents: { id: string; role: DocRoleInGroup }[];
  lineMatches: LineMatch[];
  exceptions: MatchException[];
}

export interface MatchResult {
  groups: MatchGroup[];
  /** Documents with no PO number at all: they can't be grouped. */
  unassigned: string[];
}

/** A line as the fuzzy matcher sees it. */
export type FuzzyLine = Pick<ExtractedLine, 'lineNo' | 'sku' | 'description' | 'qty' | 'uom'>;

export interface FuzzyCandidate {
  left: number;
  right: number;
  score: number;
  reason: string;
}

/**
 * Scores description-only pairings between two sets of leftover lines (ADR-0003, ADR-0009).
 * Returns candidate pairs; the pipeline picks a one-to-one assignment above the threshold.
 */
export type FuzzyMatcher = (
  left: FuzzyLine[],
  right: FuzzyLine[],
) => FuzzyCandidate[] | Promise<FuzzyCandidate[]>;
