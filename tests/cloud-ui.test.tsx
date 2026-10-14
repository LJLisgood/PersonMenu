// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Account } from '../src/Account';
import { Requests } from '../src/Requests';
import { Admin } from '../src/Admin';
import { RecipeEditor } from '../src/RecipeEditor';
import type { Manifest } from '../src/types';
const fixture = vi.hoisted(() => ({
  state: {} as Record<string, any>,
  challenge: vi.fn(async () => 'captcha-token'),
}));
vi.mock('../src/Cloud', () => ({ useCloud: () => fixture.state }));
vi.mock('../src/Captcha', () => ({
  useCaptcha: () => ({ challenge: fixture.challenge, element: { current: null } }),
}));
const session = { user: { id: 'member', is_anonymous: false, email: 'member@example.test' } };
const manifest: Manifest = {
  schemaVersion: 1,
  revision: 'test',
  recipes: [
    {
      id: 'one',
      name: '番茄炒蛋',
      category: '家常菜',
      source: 'personal',
      description: '',
      tags: [],
      difficulty: null,
      totalMinutes: null,
      servings: null,
      ingredients: ['鸡蛋'],
      cover: null,
    },
  ],
  categories: { 家常菜: 1 },
  tags: [],
  upstream: { commit: '', recipeCount: 0 },
};
beforeEach(() => {
  fixture.state = {
    config: { enabled: true },
    session,
    admin: false,
    recovery: false,
    clearRecovery: vi.fn(),
    api: vi.fn(async () => []),
    ensureGuest: vi.fn(async () => session),
    client: {
      auth: {
        signInWithPassword: vi.fn(async () => ({ error: null })),
        signUp: vi.fn(async () => ({ error: null })),
        resetPasswordForEmail: vi.fn(async () => ({ error: null })),
        updateUser: vi.fn(async () => ({ error: null })),
        signOut: vi.fn(async () => ({ error: null })),
      },
    },
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('邮箱密码登录表单通过 Auth SDK 提交并清空密码', async () => {
  fixture.state.session = null;
  render(<Account />);
  fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'member@example.test' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'test-password' } });
  fireEvent.submit(screen.getByLabelText('密码').closest('form')!);
  await screen.findByText('登录成功。');
  expect(fixture.state.client.auth.signInWithPassword).toHaveBeenCalledWith({
    email: 'member@example.test',
    password: 'test-password',
    options: { captchaToken: 'captcha-token' },
  });
  expect((screen.getByLabelText('密码') as HTMLInputElement).value).toBe('');
});
it('密码恢复页只向已恢复的 Auth 会话更新密码', async () => {
  fixture.state.recovery = true;
  render(<Account />);
  fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'new-test-password' } });
  fireEvent.click(screen.getByRole('button', { name: '保存新密码' }));
  await screen.findByText('密码已更新。');
  expect(fixture.state.client.auth.updateUser).toHaveBeenCalledWith({
    password: 'new-test-password',
  });
});
it('一餐多道菜作为单份申请提交，显示通知延迟而不声称邮件成功', async () => {
  fixture.state.api = vi.fn(async (_path: string, options?: RequestInit) =>
    options?.method === 'POST' ? { notification: 'pending' } : [],
  );
  render(<Requests manifest={manifest} initialId="one" />);
  fireEvent.change(screen.getByLabelText('你的昵称'), { target: { value: '家人' } });
  fireEvent.click(screen.getByRole('button', { name: '提交给小厨房' }));
  await screen.findByText(/申请已保存。邮件提醒暂未发出/);
  const call = fixture.state.api.mock.calls.find(
    ([, options]: [string, RequestInit?]) => options?.method === 'POST',
  );
  const data = JSON.parse(call[1].body);
  expect(data.kind).toBe('meal');
  expect(data.payload.recipeIds).toEqual(['one']);
  expect(data.payload.people).toBe(2);
  expect(data.id).toMatch(/^[a-f0-9-]{36}$/);
});
it('失败后重试同一份点菜复用编号', async () => {
  let attempts = 0;
  const ids: string[] = [];
  fixture.state.api = vi.fn(async (_path: string, options?: RequestInit) => {
    if (options?.method !== 'POST') return [];
    ids.push(JSON.parse(String(options.body)).id);
    if (++attempts === 1) throw new Error('网络中断');
    return { notification: 'sent' };
  });
  render(<Requests manifest={manifest} initialId="one" />);
  fireEvent.change(screen.getByLabelText('你的昵称'), { target: { value: '家人' } });
  fireEvent.click(screen.getByRole('button', { name: '提交给小厨房' }));
  await screen.findByText('网络中断');
  fireEvent.click(screen.getByRole('button', { name: '提交给小厨房' }));
  await screen.findByText(/申请已保存。管理员已收到邮件提醒/);
  expect(ids[0]).toBe(ids[1]);
});
it('普通用户不能打开管理工具', () => {
  render(<Admin onChanged={() => {}} />);
  expect(screen.getByText('请使用已授权的管理员账号登录。')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '新增菜谱' })).toBeNull();
});
it('管理员保存使用原记录版本，缺失数值不会被补为默认份数或难度', async () => {
  const changed = vi.fn();
  render(
    <RecipeEditor
      record={{
        id: 'one',
        document: {
          ...manifest.recipes[0],
          html: '',
          original: '## 步骤\n\n1. 翻炒。',
          steps: [],
          supporting: [],
          sourcePath: '',
          sourceUrl: null,
        },
        original_document: null,
        state: 'draft',
        revision: 7,
        updated_at: '',
        upstream_commit: null,
      }}
      onSaved={changed}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '保存菜谱' }));
  await waitFor(() => expect(changed).toHaveBeenCalled());
  const [path, options] = fixture.state.api.mock.calls[0];
  const data = JSON.parse(options.body);
  expect(path).toBe('admin/recipes/one');
  expect(data.revision).toBe(7);
  expect(data.document.servings).toBeNull();
  expect(data.document.difficulty).toBeNull();
});
