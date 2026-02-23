import { useState, useEffect, useCallback, useRef } from 'react';
import { parseApiError, type ParsedApiError } from '../lib/parseApiError';

/**
 * Generic data-fetching hook with loading / error / refetch support.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useApi(() => getConversations());
 *
 * Pass `null` as fetcher to defer the call (manual `refetch()` later).
 */

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: ParsedApiError | null;
}

export function useApi<T>(fetcher: (() => Promise<T>) | null, deps: unknown[] = []) {
  const [state, setState] = useState<UseApiState<T>>({ data: null, loading: !!fetcher, error: null });
  const mountedRef = useRef(true);

  const execute = useCallback(async () => {
    if (!fetcher) return;
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const result = await fetcher();
      if (mountedRef.current) setState({ data: result, loading: false, error: null });
    } catch (err) {
      if (mountedRef.current) setState(s => ({ ...s, loading: false, error: parseApiError(err) }));
    }
  }, [fetcher, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    execute();
    return () => { mountedRef.current = false; };
  }, [execute]);

  // Reset mounted ref on re-mount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  return { ...state, refetch: execute };
}

/**
 * Imperative mutation helper — returns an `execute` fn + state.
 *
 * Usage:
 *   const { execute, loading, error } = useMutation(sendMessage);
 *   await execute(leadId, body);
 */
export function useMutation<Args extends unknown[], R>(
  mutationFn: (...args: Args) => Promise<R>,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ParsedApiError | null>(null);

  const execute = useCallback(async (...args: Args): Promise<R> => {
    setLoading(true);
    setError(null);
    try {
      const result = await mutationFn(...args);
      return result;
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed);
      throw parsed;          // re-throw so callers can react
    } finally {
      setLoading(false);
    }
  }, [mutationFn]);

  return { execute, loading, error, clearError: () => setError(null) };
}
