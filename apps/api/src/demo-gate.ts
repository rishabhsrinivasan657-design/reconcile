import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Problem } from './schemas.ts';
import { problem } from './views.ts';

type App = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>;

export interface DemoGate {
  password: string;
  /** Signs the cookie; at least 32 characters. */
  secret: string;
}

const COOKIE = 'reconcile_demo';
const WEEK_S = 7 * 24 * 3600;

const sign = (secret: string, expires: number) =>
  createHmac('sha256', secret).update(`unlocked.${expires}`).digest('base64url');

/** Compare without leaking how much matched (hash first, so lengths always match). */
const sameText = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function isUnlocked(gate: DemoGate, cookieHeader: string | undefined, now = Date.now()) {
  const value = readCookie(cookieHeader, COOKIE);
  const [expires, mac] = (value ?? '').split('.');
  const exp = Number(expires);
  return (
    Boolean(mac) &&
    Number.isFinite(exp) &&
    exp * 1000 > now &&
    sameText(mac!, sign(gate.secret, exp))
  );
}

/**
 * The live demo's password for changes (ADR-0016, M7 AC-8). Reading stays open to everyone; any
 * request that changes data needs the signed "unlocked" cookie that POST /demo/unlock sets.
 * Without a gate (local development), only GET /demo is added and it reports "not locked".
 */
export function registerDemoGate(app: App, gate: DemoGate | undefined) {
  if (gate) {
    app.addHook('onRequest', async (req, reply) => {
      const changes = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      if (!changes || req.url.startsWith('/demo/')) return;
      if (isUnlocked(gate, req.headers.cookie)) return;
      return reply
        .status(401)
        .type('application/problem+json')
        .send(
          problem(
            401,
            'Locked',
            'Changes are locked on this demo. Unlock them with the demo password.',
          ),
        );
    });
  }

  app.get(
    '/demo',
    {
      schema: {
        summary: 'Is this a locked demo, and are changes unlocked for this browser?',
        response: { 200: z.object({ locked: z.boolean(), unlocked: z.boolean() }) },
      },
    },
    async (req) => ({
      locked: Boolean(gate),
      unlocked: gate ? isUnlocked(gate, req.headers.cookie) : true,
    }),
  );

  app.post(
    '/demo/unlock',
    {
      schema: {
        summary: 'Unlock changes on the live demo with the shared demo password',
        body: z.object({ password: z.string().max(200) }),
        response: { 200: z.object({ unlocked: z.literal(true) }), 401: Problem, 404: Problem },
      },
    },
    async (req, reply) => {
      if (!gate)
        return reply
          .status(404)
          .type('application/problem+json')
          .send(problem(404, 'Not found', 'This site has no demo lock.'));
      if (!sameText(req.body.password, gate.password)) {
        // A short pause makes guessing slow.
        await new Promise((r) => setTimeout(r, 600));
        return reply
          .status(401)
          .type('application/problem+json')
          .send(problem(401, 'Wrong password', "That's not the demo password."));
      }
      const expires = Math.floor(Date.now() / 1000) + WEEK_S;
      reply.header(
        'set-cookie',
        `${COOKIE}=${expires}.${sign(gate.secret, expires)}; Path=/; Max-Age=${WEEK_S}; HttpOnly; Secure; SameSite=Lax`,
      );
      return { unlocked: true as const };
    },
  );
}
