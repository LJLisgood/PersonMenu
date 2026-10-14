import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { CloudConfig, CloudRecipe } from '../shared/cloud';
import type { Manifest } from './types';

type CloudState = {
  ready: boolean;
  config: CloudConfig;
  client: SupabaseClient | null;
  session: Session | null;
  admin: boolean;
  error: string;
  authNotice: string;
  clearAuthNotice: () => void;
  recovery: boolean;
  clearRecovery: () => void;
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  ensureGuest: (captcha: () => Promise<string>) => Promise<Session>;
};
const Context = createContext<CloudState | null>(null);
let cachedClient: SupabaseClient | null = null;
export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  client: SupabaseClient | null = null,
): Promise<T> {
  const session = client ? (await client.auth.getSession()).data.session : null;
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: {
      ...(options.body && typeof options.body === 'string'
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...options.headers,
    },
  });
  let result;
  try {
    result = await response.json();
  } catch (error) {
    if (options.signal?.aborted) throw new DOMException('请求已取消', 'AbortError');
    throw new Error('服务返回了无法读取的内容');
  }
  if (!response.ok) throw new Error(result.error || '操作失败，请稍后再试');
  return result as T;
}
export function CloudProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false),
    [config, setConfig] = useState<CloudConfig>({ enabled: false });
  const [client, setClient] = useState<SupabaseClient | null>(null),
    [session, setSession] = useState<Session | null>(null);
  const [admin, setAdmin] = useState(false),
    [error, setError] = useState(''),
    [recovery, setRecovery] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        const response = await fetch('/api/config');
        if (response.status === 404 || response.headers.get('Content-Type')?.includes('text/html'))
          return;
        if (!response.ok) throw new Error('无法读取线上配置');
        const next = (await response.json()) as CloudConfig;
        if (disposed) return;
        setConfig(next);
        if (!next.enabled || !next.supabaseUrl || !next.publishableKey) return;
        const { createClient } = await import('@supabase/supabase-js');
        if (disposed) return;
        cachedClient ??= createClient(next.supabaseUrl, next.publishableKey, {
          auth: { flowType: 'pkce', detectSessionInUrl: false },
        });
        const connection = cachedClient;
        setClient(connection);
        const listener = connection.auth.onAuthStateChange((event, nextSession) => {
          if (!disposed) {
            setSession(nextSession);
            if (event === 'PASSWORD_RECOVERY') setRecovery(true);
          }
        });
        unsubscribe = () => listener.data.subscription.unsubscribe();
        const params = new URLSearchParams(location.search);
        if (params.has('code')) {
          const result = await connection.auth.exchangeCodeForSession(params.get('code')!);
          if (!disposed && result.error)
            setAuthNotice('验证链接已失效，请重新申请，或在发起验证的浏览器中打开');
          if (!disposed && !result.error && params.get('auth') === 'recovery') setRecovery(true);
          params.delete('code');
          params.delete('auth');
          history.replaceState(
            null,
            '',
            `${location.pathname}${params.size ? `?${params}` : ''}#/account`,
          );
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        }
        const result = await connection.auth.getSession();
        if (!disposed) setSession(result.data.session);
      } catch (failure) {
        if (!disposed) setError(failure instanceof Error ? failure.message : '线上初始化失败');
      } finally {
        if (!disposed) setReady(true);
      }
    })();
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);
  const api = useCallback(
    <T,>(path: string, options?: RequestInit) => apiRequest<T>(path, options, client),
    [client],
  );
  useEffect(() => {
    let active = true;
    setAdmin(false);
    if (session && client)
      void api<{ admin: boolean }>('me')
        .then((result) => {
          if (active) setAdmin(result.admin);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [session?.user.id, client, api]);
  const ensureGuest = useCallback(
    async (captcha: () => Promise<string>) => {
      if (!client) throw new Error('线上服务尚未启用');
      const current = (await client.auth.getSession()).data.session;
      if (current) return current;
      const result = await client.auth.signInAnonymously({
        options: { captchaToken: await captcha() },
      });
      if (result.error || !result.data.session)
        throw new Error(result.error?.message || '游客登录失败');
      return result.data.session;
    },
    [client],
  );
  const clearRecovery = useCallback(() => setRecovery(false), []);
  const clearAuthNotice = useCallback(() => setAuthNotice(''), []);
  const value = useMemo(
    () => ({
      ready,
      config,
      client,
      session,
      admin,
      error,
      authNotice,
      clearAuthNotice,
      recovery,
      clearRecovery,
      api,
      ensureGuest,
    }),
    [
      ready,
      config,
      client,
      session,
      admin,
      error,
      authNotice,
      clearAuthNotice,
      recovery,
      clearRecovery,
      api,
      ensureGuest,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useCloud() {
  const value = useContext(Context);
  if (!value) throw new Error('缺少线上服务上下文');
  return value;
}
export async function loadCloudCatalog(
  api: CloudState['api'],
  signal: AbortSignal,
): Promise<Manifest> {
  const recipes: CloudRecipe[] = [];
  const revisions: string[] = [];
  let commit = '';
  for (let page = 0; page < 1000; page++) {
    const result = await api<{
      recipes: CloudRecipe[];
      revision: string;
      hasMore: boolean;
      upstream: string;
    }>(`catalog?page=${page}`, { signal });
    recipes.push(...result.recipes);
    revisions.push(result.revision);
    commit ||= result.upstream;
    if (!result.hasMore) break;
  }
  return {
    cloud: true,
    schemaVersion: 1,
    revision: revisions.join('|'),
    recipes,
    categories: recipes.reduce<Record<string, number>>((counts, r) => {
      counts[r.category] = (counts[r.category] || 0) + 1;
      return counts;
    }, {}),
    tags: [...new Set(recipes.flatMap((r) => r.tags))].sort(),
    upstream: { commit, recipeCount: recipes.filter((r) => r.source === 'howtocook').length },
  };
}
