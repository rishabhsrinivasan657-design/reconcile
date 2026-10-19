import { LocalStorage } from '@reconcile/pipeline';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { isUnlocked } from '../src/demo-gate.ts';

const gate = { password: 'correct horse battery', secret: 's'.repeat(40) };
// These requests are refused (or answered) before any database access.
const build = (withGate: boolean) =>
  buildApp({
    db: {} as never,
    storage: new LocalStorage('/nonexistent'),
    queues: { enqueueRead: async () => undefined, enqueueMatch: async () => undefined } as never,
    ...(withGate ? { demoGate: gate } : {}),
  });

describe('demo password for changes (M7 AC-8, ADR-0016)', () => {
  it('locked: changes are refused with a clear message; reading the lock status is open', async () => {
    const app = await build(true);
    const status = await app.inject({ method: 'GET', url: '/demo' });
    expect(status.json()).toEqual({ locked: true, unlocked: false });
    const change = await app.inject({
      method: 'POST',
      url: '/exceptions/x/decision',
      payload: { action: 'APPROVE', note: 'n' },
    });
    expect(change.statusCode).toBe(401);
    expect(change.json()).toMatchObject({
      title: 'Locked',
      detail: expect.stringMatching(/Unlock them with the demo password/),
    });
    const upload = await app.inject({ method: 'POST', url: '/documents' });
    expect(upload.statusCode).toBe(401);
  });

  it('a wrong password is refused (slowly); the right one sets a signed, HTTP-only cookie', async () => {
    const app = await build(true);
    const started = Date.now();
    const wrong = await app.inject({
      method: 'POST',
      url: '/demo/unlock',
      payload: { password: 'guess' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(Date.now() - started).toBeGreaterThanOrEqual(500);
    expect(wrong.headers['set-cookie']).toBeUndefined();

    const right = await app.inject({
      method: 'POST',
      url: '/demo/unlock',
      payload: { password: gate.password },
    });
    expect(right.statusCode).toBe(200);
    const cookie = String(right.headers['set-cookie']);
    expect(cookie).toMatch(
      /^reconcile_demo=\d+\.[\w-]+; Path=\/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax$/,
    );

    const pair = cookie.split(';')[0]!;
    expect(
      (await app.inject({ method: 'GET', url: '/demo', headers: { cookie: pair } })).json(),
    ).toEqual({ locked: true, unlocked: true });
    // Unlocked: the request reaches the route (which then refuses the empty upload on its own).
    const upload = await app.inject({
      method: 'POST',
      url: '/documents',
      headers: { cookie: pair },
    });
    expect(upload.statusCode).toBe(406); // not a file upload, but past the lock
  });

  it('forged or expired cookies do not unlock', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    expect(isUnlocked(gate, `reconcile_demo=${exp}.forged`)).toBe(false);
    expect(isUnlocked(gate, `reconcile_demo=1.anything`)).toBe(false);
    expect(isUnlocked(gate, undefined)).toBe(false);
  });

  it('no gate (local development): nothing is locked', async () => {
    const app = await build(false);
    expect((await app.inject({ method: 'GET', url: '/demo' })).json()).toEqual({
      locked: false,
      unlocked: true,
    });
    expect((await app.inject({ method: 'POST', url: '/documents' })).statusCode).toBe(406);
    expect(
      (await app.inject({ method: 'POST', url: '/demo/unlock', payload: { password: 'x' } }))
        .statusCode,
    ).toBe(404);
  });
});
