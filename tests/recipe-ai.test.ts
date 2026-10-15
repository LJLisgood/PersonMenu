import { afterEach, expect, it, vi } from 'vitest';
import { validateAiDraft } from '../shared/recipeAi';
import { organizeRecipe } from '../server/recipeAi';
import { handleApi, type Env } from '../server/api';
const draft = {
  name: '炒蛋',
  category: '家常菜',
  description: '',
  tags: [],
  ingredients: '鸡蛋 2 个\n盐 适量',
  steps: ['打散鸡蛋', '炒熟'],
  notes: '',
  difficulty: null,
  totalMinutes: null,
  servings: null,
  warnings: [],
};
afterEach(() => vi.unstubAllGlobals());
it('保留真实用量、缺失值，拒绝损坏或不完整的结果', () => {
  expect(validateAiDraft(draft, ['家常菜'])).toEqual(draft);
  expect(validateAiDraft({ ...draft, category: '不存在' }, ['家常菜']).category).toBe('');
  for (const invalid of [{ steps: [] }, { servings: '2' }, { ingredients: '' }, { tags: [3] }])
    expect(() => validateAiDraft({ ...draft, ...invalid }, ['家常菜'])).toThrow();
});
it('使用 JSON 输出，拒绝被截断响应，不自动重试收费请求', async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'length', message: { content: JSON.stringify(draft) } }],
        }),
      ),
  );
  vi.stubGlobal('fetch', fetcher);
  await expect(
    organizeRecipe('secret', 'deepseek-flash', '鸡蛋2个炒熟', ['家常菜']),
  ).rejects.toThrow('截断');
  expect(fetcher).toHaveBeenCalledTimes(1);
  const body = JSON.parse(
    (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
  );
  expect(body.response_format).toEqual({ type: 'json_object' });
});
const env: Env = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  SUPABASE_SERVICE_ROLE_KEY: 'secret',
  APP_ORIGIN: 'https://kitchen.example',
  ALLOW_WRITES: 'true',
  DEEPSEEK_API_KEY: 'test-key',
};
const request = () =>
  new Request('https://kitchen.example/api/admin/recipe-assist', {
    method: 'POST',
    headers: {
      Origin: 'https://kitchen.example',
      Authorization: 'Bearer token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: '鸡蛋2个炒熟', categories: ['家常菜'] }),
  });
it.each([
  { admin: false, allowed: true, status: 403 },
  { admin: true, allowed: false, status: 429 },
  { admin: true, allowed: true, status: 200 },
])('服务端管理员鉴权及限流 $status', async ({ admin, allowed, status }) => {
  const fetcher = vi.fn(async (url: string) => {
    const value = url.includes('/auth/')
      ? { id: 'admin', email_confirmed_at: '2026-10-15' }
      : url.includes('is_kitchen_admin')
        ? admin
        : url.includes('kitchen_rate_limit')
          ? allowed
          : { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(draft) } }] };
    return new Response(JSON.stringify(value));
  });
  vi.stubGlobal('fetch', fetcher);
  const response = await handleApi(request(), env);
  expect(response.status).toBe(status);
  expect(fetcher.mock.calls.some(([url]) => url.includes('api.deepseek.com'))).toBe(status === 200);
  if (status === 200) expect(await response.json()).toEqual(draft);
});
