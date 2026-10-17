import type { QueryClient } from '@tanstack/react-query';

/** What the API announces on its live feed (mirrors packages/pipeline/src/events.ts). */
export type LiveEvent =
  | { kind: 'document'; id: string; status: string; poNumber?: string }
  | { kind: 'set'; poNumber: string; status: string }
  | { kind: 'exception'; id: string; poNumber: string; status: string };

/**
 * Which cached data an announcement makes stale (ADR-0013). Messages are hints: the page refetches
 * the fresh data itself.
 */
export function staleKeys(e: LiveEvent): readonly (readonly string[])[] {
  switch (e.kind) {
    case 'document':
      return [
        ['documents'],
        ['document', e.id],
        ['overview'],
        ...(e.poNumber
          ? [
              ['set', e.poNumber],
              ['history', e.poNumber],
            ]
          : []),
        ['sets'],
      ];
    case 'set':
      return [
        ['sets'],
        ['set', e.poNumber],
        ['history', e.poNumber],
        ['exceptions'],
        ['exception'],
        ['documents'],
        ['overview'],
      ];
    case 'exception':
      return [
        ['exceptions'],
        ['exception', e.id],
        ['set', e.poNumber],
        ['history', e.poNumber],
        ['overview'],
      ];
  }
}

export function applyLiveEvent(client: QueryClient, e: LiveEvent) {
  for (const queryKey of staleKeys(e)) void client.invalidateQueries({ queryKey });
}
