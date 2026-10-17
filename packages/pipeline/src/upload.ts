import { createHash } from 'node:crypto';
import type { Document, PrismaClient } from '@reconcile/db';
import { audit } from './audit.ts';
import type { Storage } from './storage.ts';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export class UploadRejected extends Error {
  override name = 'UploadRejected';
  constructor(
    message: string,
    readonly status: 413 | 415,
  ) {
    super(message);
  }
}

const KINDS = [
  { mime: 'application/pdf', ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: 'image/png', ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
] as const;

/** The file's real type, from its first bytes rather than its name. */
export function sniffType(bytes: Uint8Array) {
  return KINDS.find((k) => k.magic.every((b, i) => bytes[i] === b));
}

/**
 * Save an uploaded file and create its document (M4 AC-1). The same file twice returns the
 * existing document: the file's sha256 fingerprint is unique.
 */
export async function uploadDocument(
  db: PrismaClient,
  storage: Storage,
  bytes: Uint8Array,
): Promise<{ document: Document; duplicate: boolean }> {
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new UploadRejected(
      `File is ${(bytes.length / 1e6).toFixed(1)} MB; the limit is 10 MB.`,
      413,
    );
  }
  const kind = sniffType(bytes);
  if (!kind) throw new UploadRejected('Only PDF, PNG, and JPEG files are accepted.', 415);

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const existing = await db.document.findUnique({ where: { sha256 } });
  if (existing) return { document: existing, duplicate: true };

  const storagePath = `files/${sha256}.${kind.ext}`;
  await storage.put(storagePath, bytes);
  const document = await db.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: { sha256, storagePath, mimeType: kind.mime },
    });
    await audit(tx, {
      action: 'document.uploaded',
      entityType: 'Document',
      entityId: created.id,
      after: { sha256, mimeType: kind.mime, bytes: bytes.length },
    });
    return created;
  });
  return { document, duplicate: false };
}
