/**
 * Load the live demo's data (M7): the 20 CI test sets, read by the worker with the recorded AI
 * answers. Runs once: it does nothing if any document already exists, so redeploys keep the demo's
 * decisions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPrismaClient } from '@reconcile/db';
import { createQueues, loadPipelineEnv, LocalStorage, uploadDocument } from '@reconcile/pipeline';
import { Redis } from 'ioredis';

const root = path.resolve(import.meta.dirname, '../../..');
const golden = path.join(root, 'evals/golden-ci');
const env = loadPipelineEnv();
const db = createPrismaClient(env.DATABASE_URL);
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queues = createQueues(redis);

try {
  if ((await db.document.count()) > 0) {
    console.log('Demo data already loaded; leaving it as it is.');
  } else {
    const storage = new LocalStorage(path.resolve(env.STORAGE_DIR));
    let n = 0;
    for (const set of fs
      .readdirSync(golden)
      .filter((d) => /^S\d+$/.test(d))
      .sort()) {
      for (const f of fs
        .readdirSync(path.join(golden, set))
        .filter((x) => /\.(pdf|png)$/.test(x))) {
        const bytes = new Uint8Array(fs.readFileSync(path.join(golden, set, f)));
        const { document, duplicate } = await uploadDocument(db, storage, bytes);
        if (!duplicate) {
          await queues.enqueueRead(document.id);
          n++;
        }
      }
    }
    console.log(`Queued ${n} demo documents; the worker reads them with the recorded AI answers.`);
  }
} finally {
  await queues.close();
  redis.disconnect();
  await db.$disconnect();
}
