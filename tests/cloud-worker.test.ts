import { describe, expect, it, vi } from 'vitest';
import worker, { type WorkerEnv } from '../server/worker';

describe('现有 Worker 的 API 和静态资源路由', () => {
  const environment = () =>
    ({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      ASSETS: { fetch: vi.fn(async () => new Response('static asset')) },
    }) as unknown as WorkerEnv;

  it('首页和前端资源通过 ASSETS 返回', async () => {
    const env = environment();
    const request = new Request('https://example.com/assets/app.js');
    expect(await (await worker.fetch(request, env)).text()).toBe('static asset');
    expect(env.ASSETS.fetch).toHaveBeenCalledWith(request);
  });

  it('API 返回 JSON，未知 API 不落入 SPA 的 HTML 回退', async () => {
    const env = environment();
    const response = await worker.fetch(new Request('https://example.com/api/config'), env);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    const missing = await worker.fetch(new Request('https://example.com/api/missing'), env);
    expect(missing.status).toBe(401);
    expect(missing.headers.get('Content-Type')).toContain('application/json');
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });
});
