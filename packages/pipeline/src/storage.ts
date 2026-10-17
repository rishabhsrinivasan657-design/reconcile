import fs from 'node:fs/promises';
import path from 'node:path';

/** Where uploaded files live. Local disk now; an S3 version can implement the same interface. */
export interface Storage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  read(key: string): Promise<Uint8Array>;
}

export class LocalStorage implements Storage {
  constructor(readonly root: string) {}

  private file(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep))
      throw new Error(`Invalid storage key: ${key}`);
    return full;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const f = this.file(key);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, bytes);
  }

  async read(key: string): Promise<Uint8Array> {
    return new Uint8Array(await fs.readFile(this.file(key)));
  }
}
