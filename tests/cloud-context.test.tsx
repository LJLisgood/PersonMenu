// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { CloudProvider, useCloud } from '../src/Cloud';
const state = vi.hoisted(() => ({
  session: null,
  error: null as unknown,
  auth: { getSession: vi.fn(), exchangeCodeForSession: vi.fn(), onAuthStateChange: vi.fn() },
  unsubscribe: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: state.auth }) }));
function Probe() {
  const c = useCloud();
  return (
    <div>
      <span>{c.ready ? 'ready' : 'loading'}</span>
      <span>{c.config.enabled ? 'cloud' : 'local'}</span>
      <span>{c.recovery ? 'recovery' : 'normal'}</span>
      <span>{c.error}</span>
      <span>{c.authNotice}</span>
    </div>
  );
}
beforeEach(() => {
  history.replaceState(null, '', '/');
  state.error = null;
  state.auth.getSession.mockResolvedValue({ data: { session: null } });
  state.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: state.unsubscribe } },
  });
  state.auth.exchangeCodeForSession.mockImplementation(async () => ({ error: state.error }));
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            enabled: true,
            supabaseUrl: 'https://example.supabase.co',
            publishableKey: 'public-test',
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('没有 Functions 的静态开发环境继续使用本地菜谱', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } })),
  );
  render(
    <CloudProvider>
      <Probe />
    </CloudProvider>,
  );
  await screen.findByText('ready');
  expect(screen.getByText('local')).toBeTruthy();
});
it('PKCE 密码恢复会话进入恢复状态并清除 URL 中的一次性 code', async () => {
  history.replaceState(null, '', '/?code=one-time-code&auth=recovery');
  render(
    <CloudProvider>
      <Probe />
    </CloudProvider>,
  );
  await screen.findByText('ready');
  expect(screen.getByText('recovery')).toBeTruthy();
  expect(location.search).toBe('');
  expect(location.hash).toBe('#/account');
  expect(state.auth.exchangeCodeForSession).toHaveBeenCalledWith('one-time-code');
});
it('过期验证链接仍可返回账号页，不让整个菜谱站陷入初始化错误', async () => {
  state.error = new Error('expired');
  history.replaceState(null, '', '/?code=expired-code&auth=recovery');
  render(
    <CloudProvider>
      <Probe />
    </CloudProvider>,
  );
  await screen.findByText('ready');
  await waitFor(() => expect(screen.getByText(/验证链接已失效/)).toBeTruthy());
  expect(screen.getByText('normal')).toBeTruthy();
  expect(location.search).toBe('');
  expect(location.hash).toBe('#/account');
});
