import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs/promises';
const admin = '11111111-1111-4111-8111-111111111111',
  member = '22222222-2222-4222-8222-222222222222',
  guest = '33333333-3333-4333-8333-333333333333';
const db = new PGlite();
const document = (id: string, extra = {}) => ({
  id,
  name: id,
  category: '家常菜',
  source: 'personal',
  original: '正文',
  html: '<p>正文</p>',
  steps: [],
  supporting: [],
  ...extra,
});
async function as(role: string, id?: string, anonymous = false) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: id, is_anonymous: anonymous }),
  ]);
  await db.exec(`set role ${role}`);
}
async function reset() {
  await as('postgres');
  await db.exec(
    'truncate public.kitchen_requests,app_private.notifications,public.favorites,app_private.recipe_uploads,public.recipe_revisions,public.recipes,public.uploads,app_private.rate_limits cascade',
  );
}
async function recipe(id: string, state = 'published', extra = {}) {
  await db.query('insert into public.recipes(id,document,state) values($1,$2,$3)', [
    id,
    document(id, extra),
    state,
  ]);
}
beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to anon,authenticated,service_role;
  create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;`);
  for (const file of (await fs.readdir('supabase/migrations'))
    .filter((s) => s.endsWith('.sql'))
    .sort())
    await db.exec(await fs.readFile(`supabase/migrations/${file}`, 'utf8'));
  for (const id of [admin, member, guest])
    await db.query('insert into auth.users values($1)', [id]);
  await db.query('insert into app_private.admins values($1)', [admin]);
}, 30000);
beforeEach(reset);
afterAll(() => db.close());
describe('真实 PostgreSQL 引擎执行迁移与权限策略', () => {
  it('公开用户只能读取已发布菜谱，不能写入或读取管理员授权', async () => {
    await recipe('public');
    await recipe('draft', 'draft');
    await recipe('deleted', 'deleted');
    await as('anon');
    expect((await db.query('select id from public.recipes')).rows).toEqual([{ id: 'public' }]);
    await expect(recipe('intruder')).rejects.toThrow();
    await expect(db.query('select * from app_private.admins')).rejects.toThrow();
    await expect(db.query('select public.kitchen_notifications()')).rejects.toThrow();
  });
  it('匿名会话不等于管理员，账号不能自行授予管理员身份', async () => {
    await as('authenticated', guest, true);
    expect((await db.query('select public.is_kitchen_admin() admin')).rows).toEqual([
      { admin: false },
    ]);
    await expect(db.query('insert into app_private.admins values($1)', [guest])).rejects.toThrow();
    await as('authenticated', admin);
    expect((await db.query('select public.is_kitchen_admin() admin')).rows).toEqual([
      { admin: true },
    ]);
  });
  it('申请和通知同事务保存、重试同编号不重复，其他人无法读取', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await as('service_role');
    const query =
      "select (public.create_kitchen_request($1,$2,'wish','亲友',null,'{\"title\":\"蒸鱼\"}','hashed-ip')).id";
    await db.query(query, [id, guest]);
    await db.query(query, [id, guest]);
    expect((await db.query('select count(*)::int n from public.kitchen_requests')).rows).toEqual([
      { n: 1 },
    ]);
    expect((await db.query('select count(*)::int n from app_private.notifications')).rows).toEqual([
      { n: 1 },
    ]);
    await expect(
      db.query(
        "select public.create_kitchen_request($1,$2,'wish','亲友',null,'{\"title\":\"别的菜\"}','hashed-ip')",
        [id, guest],
      ),
    ).rejects.toThrow('idempotency_conflict');
    await as('authenticated', member);
    expect((await db.query('select * from public.kitchen_requests')).rows).toEqual([]);
    await as('authenticated', guest, true);
    expect((await db.query('select id from public.kitchen_requests')).rows).toHaveLength(1);
  });
  it('限频采用原子计数，通知只会被一个发送者领取', async () => {
    await as('service_role');
    for (let i = 0; i < 3; i++)
      expect((await db.query("select public.kitchen_rate_limit('key',2) ok")).rows).toEqual([
        { ok: i < 2 },
      ]);
    await db.query(
      "select public.create_kitchen_request('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',$1,'wish','亲友',null,'{}','ip')",
      [guest],
    );
    const [{ id }] = (await db.query<{ id: string }>('select id from app_private.notifications'))
      .rows;
    expect(
      (await db.query('select * from public.claim_kitchen_notification($1)', [id])).rows,
    ).toHaveLength(1);
    expect(
      (await db.query('select * from public.claim_kitchen_notification($1)', [id])).rows,
    ).toHaveLength(0);
  });
  it('发布照片随菜谱发布开放，下架后收回；历史和来源保持不变', async () => {
    await db.query(
      "insert into public.uploads(id,object_key,content_type,bytes) values('photo','uploads/photo','image/webp',20)",
    );
    await recipe('recipe', 'draft', { cover: '/api/media/photo' });
    await as('anon');
    expect((await db.query('select id from public.uploads')).rows).toEqual([]);
    await as('service_role');
    await db.query(
      "update public.recipes set state='published', original_document='{\"tampered\":true}' where id='recipe'",
    );
    expect(
      (
        await db.query<{ revision: number; original_document: unknown }>(
          'select revision,original_document from public.recipes',
        )
      ).rows,
    ).toEqual([{ revision: 2, original_document: null }]);
    await as('anon');
    expect((await db.query('select id from public.uploads')).rows).toEqual([{ id: 'photo' }]);
    await as('service_role');
    await db.exec("update public.recipes set state='deleted' where id='recipe'");
    expect((await db.query('select count(*)::int n from public.recipe_revisions')).rows).toEqual([
      { n: 2 },
    ]);
    await as('anon');
    expect((await db.query('select * from public.uploads')).rows).toEqual([]);
  });
  it('收藏仅本人可见，游客不能将匿名身份当作正式成员写入收藏', async () => {
    await recipe('recipe');
    await as('authenticated', member);
    await db.query("insert into public.favorites(owner_id,recipe_id) values($1,'recipe')", [
      member,
    ]);
    await expect(
      db.query("insert into public.favorites(owner_id,recipe_id) values($1,'recipe')", [guest]),
    ).rejects.toThrow();
    await as('authenticated', guest, true);
    expect((await db.query('select * from public.favorites')).rows).toEqual([]);
    await expect(
      db.query("insert into public.favorites(owner_id,recipe_id) values($1,'recipe')", [guest]),
    ).rejects.toThrow();
  });
});
