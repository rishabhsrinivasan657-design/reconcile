'use client';
import { useEffect, useRef } from 'react';

/** Keys typed into a field, or with a modifier, are never shortcuts. */
export function isTyping(e: Pick<KeyboardEvent, 'target' | 'metaKey' | 'ctrlKey' | 'altKey'>) {
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  const t = e.target as HTMLElement | null;
  if (!t || typeof t.closest !== 'function') return false;
  return Boolean(
    t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"] input'),
  );
}

/**
 * Turns key presses into shortcut names. Single keys map directly ("j"); "g" starts a two-key
 * sequence ("g o") that must finish within 900 ms (M5 AC-9).
 */
export function createKeyReader(now: () => number = () => Date.now()) {
  let pendingG: number | null = null;
  return (key: string): string | undefined => {
    const k = key.length === 1 ? key.toLowerCase() : key;
    if (pendingG !== null && now() - pendingG < 900) {
      pendingG = null;
      return `g ${k}`;
    }
    pendingG = null;
    if (k === 'g') {
      pendingG = now();
      return undefined;
    }
    return key === '?' ? '?' : k;
  };
}

/** Run handlers for shortcut names while the component is mounted. */
export function useKeys(handlers: Record<string, (e: KeyboardEvent) => void>, enabled = true) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const read = createKeyReader();
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const name = read(e.key);
      const h = name ? ref.current[name] : undefined;
      if (h) {
        e.preventDefault();
        h(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
