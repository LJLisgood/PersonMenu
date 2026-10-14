import { prepareRecipe, text } from '../shared/recipe';
import type { KitchenRequest, Notification, RecipeRecord, RequestState } from '../shared/cloud';
import type { RecipeDetail } from '../src/types';

export type Env = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  ADMIN_EMAIL?: string;
  APP_ORIGIN?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  ALLOW_WRITES?: string;
  MEDIA?: R2Bucket;
};
type User = { id: string; is_anonymous?: boolean; email_confirmed_at?: string };
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
async function database<T>(
  env: Env,
  path: string,
  options: RequestInit = {},
  token?: string,
  service = false,
): Promise<T> {
  const key = service ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new ApiError(503, '服务端尚未配置完成');
  const bearer = token || (service && !key.startsWith('sb_secret_') ? key : undefined);
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/${path}`, {
    ...options,
    signal: AbortSignal.timeout(12000),
    headers: {
      apikey: key,
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
    if (error.message?.includes('rate_limited')) throw new ApiError(429, '提交太频繁，请稍后再试');
    if (error.message?.includes('idempotency_conflict'))
      throw new ApiError(409, '本次申请已提交，请重新开始一份申请');
    if (response.status === 409) throw new ApiError(409, '记录已存在或已更新，请刷新后再试');
    throw new ApiError(
      response.status === 401 || response.status === 403 ? 403 : 502,
      '数据服务暂时不可用，请稍后重试',
    );
  }
  const body = await response.text();
  return (body ? JSON.parse(body) : null) as T;
}
const rpc = <T>(env: Env, name: string, args: unknown, service = true, token?: string) =>
  database<T>(env, `rpc/${name}`, { method: 'POST', body: JSON.stringify(args) }, token, service);
async function identity(
  request: Request,
  env: Env,
): Promise<{ user: User; token: string; admin: boolean }> {
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new ApiError(401, '请先登录或使用游客身份');
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new ApiError(401, '登录已过期，请重新登录');
  const user = (await response.json()) as User;
  if (!user.id || (!user.is_anonymous && !user.email_confirmed_at))
    throw new ApiError(403, '请先验证邮箱');
  const admin = await rpc<boolean>(env, 'is_kitchen_admin', {}, false, token);
  return { user, token, admin };
}
async function limitedBytes(request: Request, limit: number): Promise<Uint8Array> {
  if (Number(request.headers.get('Content-Length')) > limit) throw new ApiError(413, '内容太大');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      throw new ApiError(413, '内容太大');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json'))
    throw new ApiError(415, '请发送 JSON 内容');
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(await limitedBytes(request, 300000)));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, '无法读取提交内容');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new ApiError(400, '提交内容不正确');
  return parsed as Record<string, unknown>;
}
async function verifyCaptcha(request: Request, env: Env, user: User, token: unknown) {
  if (!user.is_anonymous) return;
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY)
    throw new ApiError(503, '游客入口尚未配置完成，请使用正式账号');
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: text(token, '人机验证', 2048),
      remoteip: request.headers.get('CF-Connecting-IP') || '',
    }),
    signal: AbortSignal.timeout(10000),
  });
  const result = (await response.json()) as {
    success: boolean;
    hostname?: string;
    action?: string;
  };
  if (
    !result.success ||
    result.hostname !== new URL(env.APP_ORIGIN || request.url).hostname ||
    result.action !== 'kitchen'
  )
    throw new ApiError(400, '人机验证未通过，请重试');
}
function writable(request: Request, env: Env) {
  if (env.ALLOW_WRITES !== 'true' || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new ApiError(503, '线上写入暂未启用');
  if (request.headers.get('Origin') !== new URL(env.APP_ORIGIN || request.url).origin)
    throw new ApiError(403, '请求来源不正确');
}
const safeId = (id: string) => {
  if (!/^[a-zA-Z0-9_.-]{1,120}$/.test(id)) throw new ApiError(400, '记录编号不正确');
  return id;
};
const uuid = (id: unknown) => {
  const value = text(id, '申请编号', 36);
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value))
    throw new ApiError(400, '申请编号不正确');
  return value;
};
const canonical = (value: unknown) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
function publicConfigurationIsSafe(env: Env): boolean {
  if (env.SUPABASE_URL) {
    try {
      const url = new URL(env.SUPABASE_URL);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== '/'
      )
        return false;
    } catch {
      return false;
    }
  }
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  if (!key || /^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try {
    const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))).role === 'anon';
  } catch {
    return false;
  }
}
function mediaIds(document: RecipeDetail): string[] {
  const urls = [
    document.cover || '',
    document.html,
    ...document.steps.map((s) => s.html),
    ...document.supporting.map((s) => s.html),
  ].join(' ');
  return [...new Set([...urls.matchAll(/\/api\/media\/([a-zA-Z0-9_.-]+)/g)].map((m) => m[1]))];
}
async function checkMedia(env: Env, document: RecipeDetail, owner: string, admin: boolean) {
  const ids = mediaIds(document);
  if (ids.length > 40) throw new ApiError(400, '每篇菜谱最多 40 张图片');
  if (!ids.length) return;
  const rows = await database<{ id: string; owner_id: string | null; is_public: boolean }[]>(
    env,
    `uploads?id=in.(${ids.join(',')})&select=id,owner_id,is_public`,
    {},
    undefined,
    true,
  );
  if (
    rows.length !== ids.length ||
    rows.some((r) => !r.is_public && r.owner_id !== owner && !admin)
  )
    throw new ApiError(403, '图片不存在或不属于你');
}
export async function sendNotification(env: Env, id: string): Promise<boolean> {
  const claimed = await rpc<Notification[]>(env, 'claim_kitchen_notification', { p_id: id });
  const item = claimed[0];
  if (!item) return false;
  let state = 'failed',
    error: string | null = null,
    provider: string | null = null;
  try {
    if (!env.RESEND_API_KEY || !env.MAIL_FROM || !env.ADMIN_EMAIL || !env.APP_ORIGIN)
      throw new Error('missing_mail_config');
    const [application] = await database<KitchenRequest[]>(
      env,
      `kitchen_requests?id=eq.${item.request_id}`,
      {},
      undefined,
      true,
    );
    if (!application) throw new Error('missing_request');
    const labels = { meal: '新的点菜申请', wish: '新的菜品心愿', submission: '新的菜谱投稿' };
    // Keep contact details and user-supplied recipe content in the protected inbox.
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `kitchen-request-${item.request_id}`,
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [env.ADMIN_EMAIL],
        subject: `灶台笔记：${labels[application.kind]}`,
        text: `小厨房收到一份${labels[application.kind]}。\n\n请登录管理员工作台查看和处理：\n${env.APP_ORIGIN}/#/admin\n\n申请编号：${application.id}\n本邮件由灶台笔记发送。`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`resend_${response.status}`);
    provider = ((await response.json()) as { id: string }).id;
    state = 'sent';
  } catch (failure) {
    error =
      failure instanceof Error &&
      /^(missing_mail_config|missing_request|resend_\d+)$/.test(failure.message)
        ? failure.message
        : 'send_unconfirmed';
  }
  await rpc(env, 'finish_kitchen_notification', {
    p_id: id,
    p_state: state,
    p_error: error,
    p_provider: provider,
  });
  return state === 'sent';
}
async function createRequest(
  request: Request,
  env: Env,
  auth: Awaited<ReturnType<typeof identity>>,
  data: Record<string, unknown>,
) {
  const id = uuid(data.id),
    nickname = text(data.nickname, '昵称', 40);
  const email = data.email ? text(data.email, '邮箱', 254) : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, '邮箱格式不正确');
  if (!['meal', 'wish', 'submission'].includes(String(data.kind)))
    throw new ApiError(400, '申请类型不正确');
  const kind = data.kind as KitchenRequest['kind'];
  const input = data.payload as Record<string, unknown> | undefined;
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ApiError(400, '申请内容不正确');
  const previous = await database<KitchenRequest[]>(
    env,
    `kitchen_requests?id=eq.${id}&owner_id=eq.${auth.user.id}`,
    {},
    undefined,
    true,
  );
  if (
    previous.length &&
    (previous[0].kind !== kind ||
      previous[0].nickname !== nickname ||
      previous[0].contact_email !== email)
  )
    throw new ApiError(409, '本次申请已提交，请重新开始一份申请');
  const payload: KitchenRequest['payload'] = {
    notes: text(input.notes ?? '', '备注', 2000, false),
  };
  if (kind === 'meal') {
    if (!Array.isArray(input.recipeIds) || !input.recipeIds.length || input.recipeIds.length > 20)
      throw new ApiError(400, '请选择 1–20 道菜');
    const ids = [...new Set(input.recipeIds.map((v) => safeId(text(v, '菜谱编号', 100))))];
    const rows = previous.length
      ? []
      : await database<RecipeRecord[]>(
          env,
          `recipes?id=in.(${ids.join(',')})&state=eq.published`,
          {},
          undefined,
          true,
        );
    if (!previous.length && rows.length !== ids.length)
      throw new ApiError(409, '部分菜谱已下架，请重新选择');
    const date = text(input.date, '用餐日期', 10);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
    const parsedDate = new Date(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date ||
      (!previous.length && date < today)
    )
      throw new ApiError(400, '请选择有效的今天或未来日期');
    if (
      !['lunch', 'dinner'].includes(String(input.meal)) ||
      !Number.isInteger(input.people) ||
      Number(input.people) < 1 ||
      Number(input.people) > 100
    )
      throw new ApiError(400, '餐次或人数不正确');
    Object.assign(payload, {
      recipeIds: ids,
      dishes: previous[0]?.payload.dishes ?? rows.map((r) => ({ id: r.id, name: r.document.name })),
      date,
      meal: input.meal,
      people: input.people,
    });
  } else if (kind === 'wish') {
    payload.title = text(input.title, '菜名', 100);
    payload.reference = text(input.reference ?? '', '参考链接', 500, false);
    if (payload.reference && !/^https?:\/\//i.test(payload.reference))
      throw new ApiError(400, '参考链接必须是 http 或 https 地址');
  } else {
    payload.recipe = await prepareRecipe(input.recipe as Record<string, unknown>, `personal-${id}`);
    await checkMedia(env, payload.recipe, auth.user.id, false);
    payload.title = payload.recipe.name;
  }
  // CAPTCHA is required only for a new submission; a committed retry cannot create another record.
  if (!previous.length) await verifyCaptcha(request, env, auth.user, data.captcha);
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const digest = [
    ...new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${env.SUPABASE_SERVICE_ROLE_KEY}:${ip}`),
      ),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const result = await rpc<KitchenRequest>(env, 'create_kitchen_request', {
    p_id: id,
    p_owner: auth.user.id,
    p_kind: kind,
    p_nickname: nickname,
    p_email: email,
    p_payload: payload,
    p_ip: digest,
  });
  let sent = false;
  try {
    const queued = await rpc<Notification[]>(env, 'kitchen_notification_for_request', {
      p_request: id,
    });
    const notification = queued.find((n) => n.request_id === id);
    sent =
      notification?.state === 'sent' ||
      (notification ? await sendNotification(env, notification.id) : false);
  } catch {
    /* The committed request and outbox survive any notification failure. */
  }
  return json(
    { request: result, notification: sent ? 'sent' : 'pending' },
    previous.length ? 200 : 201,
  );
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url),
      path = url.pathname
        .replace(/^\/api\/?/, '')
        .split('/')
        .filter(Boolean);
    const method = request.method;
    if (!publicConfigurationIsSafe(env))
      throw new ApiError(
        503,
        '公开配置无效，请检查 Supabase URL 和 Publishable key，服务端密钥不能填入公开配置',
      );
    const page = Math.max(0, Math.min(1000, Math.trunc(Number(url.searchParams.get('page')) || 0)));
    if (path[0] === 'config' && method === 'GET')
      return json({
        enabled: !!(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY),
        supabaseUrl: env.SUPABASE_URL,
        publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
        turnstileSiteKey: env.TURNSTILE_SITE_KEY,
      });
    if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY)
      throw new ApiError(503, '线上服务尚未配置');
    if (method !== 'GET' && method !== 'HEAD') writable(request, env);
    if (path[0] === 'catalog' && method === 'GET') {
      const rows = await database<RecipeRecord[]>(
        env,
        `recipes?state=eq.published&select=id,document,revision,upstream_commit&order=id&limit=100&offset=${page * 100}`,
      );
      return json({
        recipes: rows.map((r) => {
          const {
            html: _html,
            steps: _steps,
            supporting: _supporting,
            original,
            sourcePath: _path,
            sourceUrl: _url,
            ...summary
          } = r.document;
          return { ...summary, searchBody: original };
        }),
        hasMore: rows.length === 100,
        revision: rows.map((r) => `${r.id}:${r.revision}`).join(','),
        upstream: rows.find((r) => r.upstream_commit)?.upstream_commit ?? '',
      });
    }
    if (path[0] === 'recipes' && path[1] && method === 'GET') {
      const [row] = await database<RecipeRecord[]>(
        env,
        `recipes?id=eq.${safeId(path[1])}&state=eq.published`,
      );
      if (!row) throw new ApiError(404, '菜谱不存在或已下架');
      return json(row.document);
    }
    if (path[0] === 'media' && path[1] && method === 'GET') {
      if (!env.MEDIA) throw new ApiError(503, '图片存储尚未绑定');
      const id = safeId(path[1]);
      let rows = await database<{ object_key: string; content_type: string }[]>(
        env,
        `uploads?id=eq.${id}&is_public=eq.true`,
      );
      if (!rows.length) {
        const auth = await identity(request, env);
        rows = await database(env, `uploads?id=eq.${id}`, {}, auth.token);
      }
      if (!rows.length) throw new ApiError(404, '图片不存在');
      const object = await env.MEDIA.get(rows[0].object_key);
      if (!object) throw new ApiError(404, '图片不存在');
      return new Response(object.body, {
        headers: {
          'Content-Type': rows[0].content_type,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, max-age=60',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      });
    }
    const auth = await identity(request, env);
    if (path[0] === 'me' && method === 'GET')
      return json({ id: auth.user.id, anonymous: !!auth.user.is_anonymous, admin: auth.admin });
    if (path[0] === 'favorites') {
      if (auth.user.is_anonymous) throw new ApiError(403, '请注册或登录后同步收藏');
      if (method === 'GET')
        return json(await database(env, 'favorites?select=recipe_id', {}, auth.token));
      if (path[1] && method === 'PUT') {
        const id = safeId(path[1]);
        const rows = await database<RecipeRecord[]>(
          env,
          `recipes?id=eq.${id}&state=eq.published`,
          {},
          auth.token,
        );
        if (!rows.length) throw new ApiError(404, '菜谱不存在或已下架');
        await database(
          env,
          'favorites?on_conflict=owner_id,recipe_id',
          {
            method: 'POST',
            headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
            body: JSON.stringify({ owner_id: auth.user.id, recipe_id: id }),
          },
          auth.token,
        );
        return json({ saved: true });
      }
      if (path[1] && method === 'DELETE') {
        await database(
          env,
          `favorites?recipe_id=eq.${safeId(path[1])}`,
          { method: 'DELETE' },
          auth.token,
        );
        return json({ saved: false });
      }
    }
    if (path[0] === 'requests' && method === 'GET')
      return json(
        await database(
          env,
          `kitchen_requests?order=created_at.desc,id&limit=100&offset=${page * 100}`,
          {},
          auth.token,
        ),
      );
    if (path[0] === 'requests' && method === 'POST') {
      if (
        !(await rpc<boolean>(env, 'kitchen_rate_limit', {
          p_key: `request:attempt:${auth.user.id}`,
          p_limit: 30,
        }))
      )
        throw new ApiError(429, '提交太频繁，请稍后再试');
      return await createRequest(request, env, auth, await body(request));
    }
    if (path[0] === 'uploads' && method === 'POST') {
      if (!env.MEDIA) throw new ApiError(503, '图片存储尚未绑定');
      await verifyCaptcha(request, env, auth.user, request.headers.get('X-Captcha-Token'));
      if (!(await rpc(env, 'kitchen_rate_limit', { p_key: `upload:${auth.user.id}`, p_limit: 20 })))
        throw new ApiError(429, '上传太频繁，请稍后再试');
      const bytes = await limitedBytes(request, 3 * 1024 * 1024);
      const type = request.headers.get('Content-Type');
      const valid =
        (type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
        (type === 'image/png' &&
          [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) ||
        (type === 'image/webp' &&
          new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
          new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP');
      if (!valid) throw new ApiError(400, '请上传有效的 JPEG、PNG 或 WebP 图片');
      const id = crypto.randomUUID(),
        key = `uploads/${auth.user.id}/${id}`;
      await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type! } });
      try {
        await database(
          env,
          'uploads',
          {
            method: 'POST',
            body: JSON.stringify({
              id,
              owner_id: auth.user.id,
              object_key: key,
              content_type: type,
              bytes: bytes.length,
            }),
          },
          undefined,
          true,
        );
      } catch (error) {
        await env.MEDIA.delete(key);
        throw error;
      }
      return json({ id, url: `/api/media/${id}` }, 201);
    }
    if (path[0] !== 'admin' || !auth.admin) throw new ApiError(403, '仅管理员可以执行此操作');
    if (path[1] === 'recipes' && method === 'GET')
      return json(
        await database(env, `recipes?order=id&limit=100&offset=${page * 100}`, {}, auth.token),
      );
    if (path[1] === 'requests' && method === 'GET')
      return json(
        await database(
          env,
          `kitchen_requests?order=created_at.desc,id&limit=100&offset=${page * 100}`,
          {},
          auth.token,
        ),
      );
    if (path[1] === 'notifications' && method === 'GET')
      return json(await rpc(env, 'kitchen_notifications_page', { p_page: page }));
    if (path[1] === 'notifications' && path[2] && method === 'POST') {
      const id = uuid(path[2]);
      return json({ sent: await sendNotification(env, id) });
    }
    if (path[1] === 'requests' && path[2] && method === 'PATCH') {
      const data = await body(request);
      const states: RequestState[] = ['pending', 'accepted', 'rejected', 'completed', 'cancelled'];
      if (!states.includes(data.state as RequestState)) throw new ApiError(400, '处理状态不正确');
      const note = text(data.note ?? '', '处理备注', 1000, false);
      const rows = await database(
        env,
        `kitchen_requests?id=eq.${uuid(path[2])}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            state: data.state,
            admin_note: note,
            updated_at: new Date().toISOString(),
          }),
        },
        undefined,
        true,
      );
      return json(rows);
    }
    if (path[1] === 'recipes' && (method === 'POST' || method === 'PATCH')) {
      const data = await body(request),
        id = path[2]
          ? safeId(path[2])
          : `personal-${data.creationId ? uuid(data.creationId) : crypto.randomUUID()}`;
      const [current] =
        path[2] || data.creationId
          ? await database<RecipeRecord[]>(env, `recipes?id=eq.${id}`, {}, auth.token)
          : [];
      if (path[2] && !current) throw new ApiError(404, '菜谱不存在');
      if (current && method === 'POST') {
        const candidate = await prepareRecipe(
          data.document as Record<string, unknown>,
          id,
          current.document,
        );
        if (canonical(candidate) !== canonical(current.document) || data.state !== current.state)
          throw new ApiError(409, '这份菜谱已保存，请从管理列表重新打开后编辑');
        return json(current);
      }
      if (current && data.revision !== current.revision)
        throw new ApiError(409, '菜谱已被修改，请刷新后再编辑');
      if (!['draft', 'published', 'deleted'].includes(String(data.state)))
        throw new ApiError(400, '发布状态不正确');
      let document = current?.document;
      if (data.document)
        document = await prepareRecipe(
          data.document as Record<string, unknown>,
          id,
          current?.document,
        );
      if (!document) throw new ApiError(400, '请填写菜谱');
      await checkMedia(env, document, auth.user.id, true);
      const result = await database<RecipeRecord[]>(
        env,
        current ? `recipes?id=eq.${id}&revision=eq.${current.revision}` : 'recipes',
        {
          method: current ? 'PATCH' : 'POST',
          body: JSON.stringify(
            current ? { document, state: data.state } : { id, document, state: data.state },
          ),
        },
        undefined,
        true,
      );
      if (!result.length) throw new ApiError(409, '菜谱已被修改，请刷新后重试');
      return json(result[0], current ? 200 : 201);
    }
    throw new ApiError(404, '接口不存在');
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    // Validation errors carry no credentials or upstream response payloads.
    if (
      error instanceof Error &&
      /(格式不正确|最多|不正确|只能引用|图片请使用)/.test(error.message)
    )
      return json({ error: error.message }, 400);
    return json({ error: '服务暂时不可用，请稍后重试' }, 503);
  }
}
