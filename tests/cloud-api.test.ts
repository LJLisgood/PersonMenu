import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleApi, sendNotification, type Env } from '../server/api';
import { prepareRecipe } from '../shared/recipe';
const env: Env = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  SUPABASE_SERVICE_ROLE_KEY: 'private-test',
  APP_ORIGIN: 'https://kitchen.example',
  ALLOW_WRITES: 'true',
};
const user = {
  id: '22222222-2222-4222-8222-222222222222',
  is_anonymous: false,
  email_confirmed_at: '2026-10-14',
};
const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ok = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function request(path: string, method = 'GET', data?: unknown) {
  return new Request(`https://kitchen.example/api/${path}`, {
    method,
    headers: {
      Origin: 'https://kitchen.example',
      Authorization: 'Bearer user-token',
      'Content-Type': 'application/json',
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
function mock(handler: (path: string, options: RequestInit) => Response | Promise<Response>) {
  return vi.stubGlobal(
    'fetch',
    vi.fn((url: string, options: RequestInit = {}) => {
      if (url.endsWith('/auth/v1/user')) return Promise.resolve(ok(user));
      if (url.endsWith('/rpc/is_kitchen_admin')) return Promise.resolve(ok(false));
      return Promise.resolve(handler(url, options));
    }),
  );
}
afterEach(() => vi.unstubAllGlobals());
describe('Pages API 的信任边界', () => {
  it('公开配置不包含服务端密钥', async () => {
    const body = await (
      await handleApi(request('config'), { ...env, RESEND_API_KEY: 'mail-secret' })
    ).text();
    expect(body).not.toContain('private-test');
    expect(body).not.toContain('mail-secret');
  });
  it('来源校验及关闭写入时不会访问任何上游', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(
      (await handleApi(request('requests', 'POST', {}), { ...env, ALLOW_WRITES: 'false' })).status,
    ).toBe(503);
    expect(
      (
        await handleApi(
          new Request('https://kitchen.example/api/requests', {
            method: 'POST',
            headers: { Origin: 'https://attacker.example' },
          }),
          env,
        )
      ).status,
    ).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('不信任浏览器传来的管理员标记或未经验证的令牌', async () => {
    mock(() => ok([]));
    expect((await handleApi(request('admin/recipes', 'POST', { admin: true }), env)).status).toBe(
      403,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(() => ok({}, 401)),
    );
    expect((await handleApi(request('admin/recipes'), env)).status).toBe(401);
  });
  it('公开目录只查询发布内容，搜索文本保留而不返回历史来源副本', async () => {
    mock((path, options) => {
      expect(path).toContain('state=eq.published');
      expect((options.headers as Record<string, string>).apikey).toBe('sb_publishable_test');
      expect((options.headers as Record<string, string>).Authorization).toBeUndefined();
      return ok([
        {
          id: 'one',
          document: {
            id: 'one',
            name: '番茄炒蛋',
            original: '鸡蛋番茄',
            html: '<p>hi</p>',
            steps: [],
            supporting: [],
          },
          revision: 2,
        },
      ]);
    });
    const result = await handleApi(request('catalog'), env);
    const data = (await result.json()) as { recipes: Record<string, unknown>[] };
    expect(data.recipes[0].searchBody).toBe('鸡蛋番茄');
    expect(data.recipes[0]).not.toHaveProperty('html');
  });
  it('非法类型和未配置验证码的游客提交不能创建记录', async () => {
    mock(() => ok([]));
    expect(
      (
        await handleApi(
          request('requests', 'POST', {
            id: requestId,
            nickname: '家人',
            kind: 'admin',
            payload: {},
          }),
          env,
        )
      ).status,
    ).toBe(400);
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        ok(
          url.endsWith('/auth/v1/user')
            ? { ...user, is_anonymous: true }
            : url.endsWith('/rpc/is_kitchen_admin')
              ? false
              : [],
        ),
      ),
    );
    expect(
      (
        await handleApi(
          request('requests', 'POST', {
            id: requestId,
            nickname: '家人',
            kind: 'wish',
            payload: { title: '蒸鱼' },
          }),
          env,
        )
      ).status,
    ).toBe(503);
  });
  it('邮件失败不回滚已经保存的申请，且不会返回密钥或上游正文', async () => {
    const paths: string[] = [];
    mock((path) => {
      paths.push(path);
      if (path.includes('/create_kitchen_request')) return ok({ id: requestId });
      if (path.includes('/kitchen_notification_for_request'))
        return ok([{ id: requestId, request_id: requestId, state: 'pending' }]);
      if (path.includes('/claim_kitchen_notification'))
        return ok([{ id: requestId, request_id: requestId }]);
      return ok([]);
    });
    const result = await handleApi(
      request('requests', 'POST', {
        id: requestId,
        nickname: '家人',
        kind: 'wish',
        payload: { title: '蒸鱼' },
      }),
      env,
    );
    expect(result.status).toBe(201);
    expect(await result.json()).toMatchObject({ notification: 'pending' });
    expect(paths.some((p) => p.includes('finish_kitchen_notification'))).toBe(true);
  });
  it('通知重试复用固定幂等编号，邮件只包含工作台链接', async () => {
    const bodies: string[] = [];
    mock((path, options) => {
      if (path.includes('claim_kitchen_notification')) {
        expect((options.headers as Record<string, string>).Authorization).toBeUndefined();
        expect((options.headers as Record<string, string>).apikey).toBe('sb_secret_test');
        return ok([{ id: requestId, request_id: requestId }]);
      }
      if (path.includes('/kitchen_requests?'))
        return ok([
          {
            id: requestId,
            kind: 'meal',
            nickname: 'private-name',
            contact_email: 'private@example.test',
          },
        ]);
      if (path === 'https://api.resend.com/emails') {
        expect((options.headers as Record<string, string>)['Idempotency-Key']).toBe(
          `kitchen-request-${requestId}`,
        );
        bodies.push(String(options.body));
        return ok({ id: 'test-message' });
      }
      return ok(null);
    });
    expect(
      await sendNotification(
        {
          ...env,
          SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
          RESEND_API_KEY: 'test-mail',
          MAIL_FROM: 'notify@example.test',
          ADMIN_EMAIL: 'admin@example.test',
        },
        requestId,
      ),
    ).toBe(true);
    expect(bodies[0]).not.toContain('private-name');
    expect(bodies[0]).not.toContain('private@example.test');
  });
  it('版本冲突不会覆盖现有菜谱', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        ok(
          url.endsWith('/auth/v1/user')
            ? user
            : url.endsWith('/rpc/is_kitchen_admin')
              ? true
              : [{ id: 'one', revision: 3, document: {} }],
        ),
      ),
    );
    expect(
      (
        await handleApi(
          request('admin/recipes/one', 'PATCH', { revision: 2, state: 'deleted' }),
          env,
        )
      ).status,
    ).toBe(409);
  });
  it('未公开的图片不会通过游客 GET 泄漏', async () => {
    mock(() => ok([]));
    const input = new Request('https://kitchen.example/api/media/photo');
    expect((await handleApi(input, { ...env, MEDIA: {} as R2Bucket })).status).toBe(401);
  });
});
describe('在线内容继续清理 HTML 并保留嵌套说明', () => {
  it('不接受脚本、远程注入的 HTML 或伪造来源字段', async () => {
    const result = await prepareRecipe(
      {
        name: '炒蛋',
        category: '家常',
        original:
          '<script>alert(1)</script>\n\n## 食材\n\n- 鸡蛋适量\n\n## 步骤\n\n1. 翻炒。\n   - 留意火候。\n\n## 备注\n\n保持小火。',
        source: 'howtocook',
        html: '<script>injected</script>',
        difficulty: null,
      },
      'permanent',
    );
    expect(result.html).not.toContain('<script>');
    expect(result.source).toBe('personal');
    expect(result.steps[0].html).toContain('留意火候');
    expect(result.supporting.some((s) => s.name === '备注')).toBe(true);
    expect(result.servings).toBeNull();
  });
  it('仅允许受控图片路径，保留原有来源和稳定步骤编号', async () => {
    await expect(
      prepareRecipe(
        {
          name: '菜',
          category: '家常',
          original: '![a](javascript:alert)',
          cover: 'https://evil.test/image',
        },
        'one',
      ),
    ).rejects.toThrow();
    const existing = await prepareRecipe(
      { name: '菜', category: '家常', original: '## 步骤\n\n1. 做菜。' },
      'stable',
    );
    const result = await prepareRecipe(
      {
        ...existing,
        name: '改名',
        original: '## 步骤\n\n1. 做菜。\n   ![照片](/api/media/abc.webp)',
      },
      'stable',
      { ...existing, source: 'howtocook', sourceUrl: 'https://github.com/upstream' },
    );
    expect(result.id).toBe('stable');
    expect(result.source).toBe('howtocook');
    expect(result.steps[0].id).toBe('stable-0');
    expect(result.sourceUrl).toBe('https://github.com/upstream');
  });
});

it('申请已提交后即使通知队列读取失败，也返回已保存的申请', async () => {
  mock((path) => {
    if (path.includes('kitchen_rate_limit')) return ok(true);
    if (path.includes('create_kitchen_request')) return ok({ id: requestId });
    if (path.includes('kitchen_notification_for_request'))
      return ok({ message: 'upstream-private-response' }, 500);
    return ok([]);
  });
  const response = await handleApi(
    request('requests', 'POST', {
      id: requestId,
      nickname: '家人',
      kind: 'wish',
      payload: { title: '蒸鱼' },
    }),
    env,
  );
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({
    request: { id: requestId },
    notification: 'pending',
  });
});
it('重试已保存的点菜使用原菜名快照，不因菜谱下架而重复创建或失败', async () => {
  const payload = {
    notes: '',
    recipeIds: ['one'],
    dishes: [{ id: 'one', name: '原菜名' }],
    date: '2026-01-01',
    meal: 'dinner',
    people: 2,
  };
  mock((path, options) => {
    if (path.includes('kitchen_rate_limit')) return ok(true);
    if (path.includes('/kitchen_requests?'))
      return ok([{ id: requestId, kind: 'meal', nickname: '家人', contact_email: null, payload }]);
    if (path.includes('create_kitchen_request')) {
      expect(JSON.parse(String(options.body)).p_payload).toEqual(payload);
      return ok({ id: requestId });
    }
    if (path.includes('/recipes?')) throw new Error('不应重新查询已下架的菜谱');
    return ok([]);
  });
  const response = await handleApi(
    request('requests', 'POST', {
      id: requestId,
      nickname: '家人',
      kind: 'meal',
      payload: { recipeIds: ['one'], date: '2026-01-01', meal: 'dinner', people: 2 },
    }),
    env,
  );
  expect(response.status).toBe(200);
});

it('新菜谱重试保留同一永久 ID，并接受数据库 JSONB 的键顺序', async () => {
  const id = `personal-${requestId}`;
  const input = { name: '新菜', category: '家常菜', original: '## 步骤\n\n1. 翻炒。' };
  const document = await prepareRecipe(input, id);
  const stored = {
    id,
    document: Object.fromEntries(Object.entries(document).reverse()),
    state: 'draft',
    revision: 1,
  };
  const fetch = vi.fn((url: string, options: RequestInit = {}) => {
    if (url.endsWith('/auth/v1/user')) return Promise.resolve(ok(user));
    if (url.endsWith('/rpc/is_kitchen_admin')) return Promise.resolve(ok(true));
    expect(options.method ?? 'GET').toBe('GET');
    return Promise.resolve(ok([stored]));
  });
  vi.stubGlobal('fetch', fetch);
  const response = await handleApi(
    request('admin/recipes', 'POST', { creationId: requestId, document: input, state: 'draft' }),
    env,
  );
  expect(response.status).toBe(200);
  expect(((await response.json()) as { id: string }).id).toBe(id);
});

it('误填服务端密钥或数据库连接密码时，公开配置拒绝返回原值', async () => {
  for (const unsafe of [
    { ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_do_not_expose' },
    { ...env, SUPABASE_PUBLISHABLE_KEY: 're_mail_secret' },
    { ...env, SUPABASE_URL: 'postgres://user:database-password@db.example/postgres' },
  ]) {
    const response = await handleApi(request('config'), unsafe);
    expect(response.status).toBe(503);
    const output = await response.text();
    expect(output).not.toContain('do_not_expose');
    expect(output).not.toContain('re_mail_secret');
    expect(output).not.toContain('database-password');
  }
});
