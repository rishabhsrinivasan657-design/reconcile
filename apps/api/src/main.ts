import fs from 'node:fs';
import path from 'node:path';
import { createPrismaClient } from '@reconcile/db';
import { createQueues, loadPipelineEnv, LocalStorage, redisEventBus } from '@reconcile/pipeline';
import { Redis } from 'ioredis';
import { buildApp } from './app.ts';

const rootEnv = path.resolve(import.meta.dirname, '../../../.env');
if (fs.existsSync(rootEnv)) process.loadEnvFile(rootEnv);
process.chdir(path.resolve(import.meta.dirname, '../../..'));

const env = loadPipelineEnv();
const db = createPrismaClient(env.DATABASE_URL);
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queues = createQueues(redis);
const app = await buildApp({
  db,
  storage: new LocalStorage(path.resolve(env.STORAGE_DIR)),
  queues,
  events: redisEventBus(redis),
  pingRedis: () => redis.ping(),
});

await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
console.log(
  `Reconcile API on http://localhost:${env.API_PORT} · manual at http://localhost:${env.API_PORT}/docs`,
);

const shutdown = async () => {
  await app.close();
  await queues.close();
  redis.disconnect();
  await db.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
