import type { Redis } from 'ioredis';

/** Redis channel the worker and API announce changes on (ADR-0013). */
export const EVENTS_CHANNEL = 'reconcile:events';

/**
 * A hint that something changed, never the full record: the browser refetches what it shows.
 * A missed message is harmless because the browser refetches everything on reconnect.
 */
export type LiveEvent =
  | { kind: 'document'; id: string; status: string; poNumber?: string }
  | { kind: 'set'; poNumber: string; status: string }
  | { kind: 'exception'; id: string; poNumber: string; status: string };

export interface EventBus {
  publish(e: LiveEvent): Promise<void>;
  /** Calls `fn` for every event until the returned function is called. */
  subscribe(fn: (e: LiveEvent) => void): Promise<() => Promise<void>>;
}

/** Announcements are best-effort: a Redis hiccup must never fail the job or request. */
export function redisEventBus(publisher: Redis): EventBus {
  return {
    async publish(e) {
      await publisher.publish(EVENTS_CHANNEL, JSON.stringify(e)).catch(() => undefined);
    },
    async subscribe(fn) {
      // A subscribed Redis connection can't run other commands, so each subscriber gets its own.
      const sub = publisher.duplicate();
      const onMessage = (channel: string, message: string) => {
        if (channel !== EVENTS_CHANNEL) return;
        try {
          fn(JSON.parse(message) as LiveEvent);
        } catch {
          // Ignore malformed messages: they're hints, not data.
        }
      };
      sub.on('message', onMessage);
      await sub.subscribe(EVENTS_CHANNEL);
      return async () => {
        sub.off('message', onMessage);
        await sub.quit().catch(() => sub.disconnect());
      };
    },
  };
}

/** In-process bus for tests and for running without Redis. */
export function memoryEventBus(): EventBus & { published: LiveEvent[] } {
  const listeners = new Set<(e: LiveEvent) => void>();
  const published: LiveEvent[] = [];
  return {
    published,
    async publish(e) {
      published.push(e);
      for (const l of listeners) l(e);
    },
    async subscribe(fn) {
      listeners.add(fn);
      return async () => void listeners.delete(fn);
    },
  };
}
