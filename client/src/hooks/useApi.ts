import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '../api/client';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Runs `loader` on mount and whenever a dependency changes, with stale-response guarding. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const ticket = ++latest.current;
    setLoading(true);
    setError(null);
    loader()
      .then((result) => { if (ticket === latest.current) setData(result); })
      .catch((err: unknown) => {
        if (ticket !== latest.current) return;
        setError(err instanceof ApiRequestError ? err.message : 'Could not load this. Check your connection and try again.');
      })
      .finally(() => { if (ticket === latest.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

/** Re-runs a loader on an interval, for the pages that mirror live router state. */
export function usePolling<T>(loader: () => Promise<T>, intervalMs: number, deps: unknown[] = []): AsyncState<T> {
  const state = useAsync(loader, deps);
  const reload = state.reload;
  useEffect(() => {
    if (intervalMs <= 0) return;
    const timer = setInterval(reload, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, reload]);
  return state;
}

export function useSubmit<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
): { run: (...args: TArgs) => Promise<TResult | null>; busy: boolean; error: string | null; clearError: () => void } {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | null> => {
      setBusy(true);
      setError(null);
      try {
        return await action(...args);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : 'That did not work. Please try again.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [action],
  );

  return { run, busy, error, clearError: useCallback(() => setError(null), []) };
}
