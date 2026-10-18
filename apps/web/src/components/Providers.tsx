'use client';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { applyLiveEvent, type LiveEvent } from '@/lib/live';

type LiveStatus = 'connecting' | 'live' | 'offline';
interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}
interface Ui {
  live: LiveStatus;
  toast: (message: string, undo?: () => void) => void;
  dialog: 'none' | 'shortcuts' | 'search' | 'unlock';
  /** Call when the API refused a change because the demo is locked (401): opens the unlock dialog. */
  handleLocked: (err: unknown) => boolean;
  openDialog: (d: Ui['dialog']) => void;
}
const UiContext = createContext<Ui | null>(null);
export const useUi = () => {
  const ui = useContext(UiContext);
  if (!ui) throw new Error('useUi outside <Providers>');
  return ui;
};

/** Listens to the API's live feed and marks the matching cached data stale (ADR-0013). */
function useLiveFeed(): LiveStatus {
  const client = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('connecting');
  useEffect(() => {
    let wasDown = false;
    const source = new EventSource('/api/events');
    source.onopen = () => {
      setStatus('live');
      // Messages may have been missed while disconnected: refresh everything once.
      if (wasDown) void client.invalidateQueries();
      wasDown = false;
    };
    source.onerror = () => {
      wasDown = true;
      setStatus('offline');
    };
    source.addEventListener('change', (m) => {
      try {
        applyLiveEvent(client, JSON.parse((m as MessageEvent<string>).data) as LiveEvent);
      } catch {
        // A malformed hint is ignored; the next refetch catches up.
      }
    });
    return () => source.close();
  }, [client]);
  return status;
}

function UiProvider({ children }: { children: React.ReactNode }) {
  const live = useLiveFeed();
  const [toast, setToast] = useState<Toast | null>(null);
  const [dialog, openDialog] = useState<Ui['dialog']>('none');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((message: string, undo?: () => void) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), message, ...(undo ? { undo } : {}) });
    timer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  return (
    <UiContext.Provider
      value={{
        live,
        toast: show,
        dialog,
        openDialog,
        handleLocked: (err) => {
          if ((err as { status?: number } | null)?.status !== 401) return false;
          openDialog('unlock');
          return true;
        },
      }}
    >
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id}>
            <span>{toast.message}</span>
            {toast.undo && (
              <button
                onClick={() => {
                  toast.undo?.();
                  setToast(null);
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </UiContext.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <UiProvider>{children}</UiProvider>
    </QueryClientProvider>
  );
}
