// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Account } from '../src/Account';

const fixture = vi.hoisted(() => ({
  signUp: vi.fn(async (_credentials: unknown) => ({ error: null })),
}));
vi.mock('../src/Cloud', () => ({
  useCloud: () => ({
    config: { enabled: true, turnstileSiteKey: 'test-site-key' },
    session: null,
    client: { auth: { signUp: fixture.signUp } },
  }),
}));

type WidgetOptions = {
  callback: (token: string) => void;
  'error-callback': (code: string) => void;
  'timeout-callback': () => void;
};
let callbacks: WidgetOptions[];

function submitSignup() {
  render(<Account />);
  fireEvent.click(screen.getByRole('button', { name: '注册', exact: true }));
  fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'member@example.test' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'test-password' } });
  fireEvent.submit(screen.getByLabelText('密码').closest('form')!);
}

beforeEach(() => {
  vi.useFakeTimers();
  fixture.signUp.mockClear();
  callbacks = [];
  window.turnstile = {
    render: vi.fn((_element, options) => {
      callbacks.push(options as unknown as WidgetOptions);
      return `widget-${callbacks.length}`;
    }),
    execute: vi.fn(),
    remove: vi.fn(),
    reset: vi.fn(),
  };
});
afterEach(() => {
  cleanup();
  document.querySelectorAll('script[src*="challenges.cloudflare.com"]').forEach((s) => s.remove());
  delete window.turnstile;
  vi.useRealTimers();
});

it('验证码脚本没有返回时结束等待，恢复注册按钮，并允许重新加载', async () => {
  delete window.turnstile;
  submitSignup();
  expect(fixture.signUp).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(15000));
  expect(screen.getByText(/人机验证加载超时/)).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: '注册并发送验证邮件' }) as HTMLButtonElement).disabled,
  ).toBe(false);
  expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();
  fireEvent.submit(screen.getByLabelText('密码').closest('form')!);
  const retryScript = document.querySelector('script[src*="challenges.cloudflare.com"]')!;
  expect(retryScript).toBeTruthy();
  await act(async () => fireEvent.error(retryScript));
  expect(screen.getByText(/人机验证加载失败/)).toBeTruthy();
  expect(fixture.signUp).not.toHaveBeenCalled();
});

it('显示可交互验证，失败后不自动循环；重试时忽略旧组件回调，只提交新令牌', async () => {
  submitSignup();
  await act(async () => {});
  expect(window.turnstile!.render).toHaveBeenCalledWith(
    expect.any(HTMLElement),
    expect.objectContaining({
      appearance: 'always',
      retry: 'never',
    }),
  );
  expect(screen.getByText(/请完成上方的人机验证/)).toBeTruthy();
  expect(fixture.signUp).not.toHaveBeenCalled();
  await act(async () => callbacks[0]['error-callback']('300010'));
  expect(screen.getByText(/300010/)).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: '注册并发送验证邮件' }) as HTMLButtonElement).disabled,
  ).toBe(false);
  fireEvent.submit(screen.getByLabelText('密码').closest('form')!);
  await act(async () => {});
  expect(callbacks).toHaveLength(2);
  expect(window.turnstile!.remove).toHaveBeenCalledWith('widget-1');
  await act(async () => callbacks[0].callback('stale-token'));
  expect(fixture.signUp).not.toHaveBeenCalled();
  await act(async () => callbacks[1].callback('fresh-token'));
  expect(fixture.signUp).toHaveBeenCalledExactlyOnceWith({
    email: 'member@example.test',
    password: 'test-password',
    options: { emailRedirectTo: expect.any(String), captchaToken: 'fresh-token' },
  });
  expect(screen.getByText('请查收验证邮件，验证后即可登录。')).toBeTruthy();
});

it('交互超时会解除提交锁，不会向 Auth 发送缺少令牌的注册请求', async () => {
  submitSignup();
  await act(async () => {});
  await act(async () => callbacks[0]['timeout-callback']());
  expect(screen.getByText(/人机验证超时/)).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: '注册并发送验证邮件' }) as HTMLButtonElement).disabled,
  ).toBe(false);
  expect(fixture.signUp).not.toHaveBeenCalled();
});

it('用户可取消卡住的验证，再次提交成功前忽略已取消的回调', async () => {
  submitSignup();
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: '取消验证' }));
  await act(async () => {});
  expect(screen.getByText('人机验证已取消，可以重新提交。')).toBeTruthy();
  await act(async () => callbacks[0].callback('cancelled-token'));
  expect(fixture.signUp).not.toHaveBeenCalled();
  expect(window.turnstile!.remove).toHaveBeenCalledWith('widget-1');
  expect(
    (screen.getByRole('button', { name: '注册并发送验证邮件' }) as HTMLButtonElement).disabled,
  ).toBe(false);
});

it('组件未触发任何回调时有等待上限，并销毁挂起组件', async () => {
  submitSignup();
  await act(async () => {});
  await act(async () => vi.advanceTimersByTimeAsync(90000));
  expect(screen.getByText(/人机验证超时/)).toBeTruthy();
  expect(window.turnstile!.remove).toHaveBeenCalledWith('widget-1');
  expect(
    (screen.getByRole('button', { name: '注册并发送验证邮件' }) as HTMLButtonElement).disabled,
  ).toBe(false);
  expect(fixture.signUp).not.toHaveBeenCalled();
});

it('组件初始化抛错后可以重新提交，不遗留待验证锁', async () => {
  vi.mocked(window.turnstile!.render).mockImplementationOnce(() => {
    throw new Error('无法初始化验证');
  });
  submitSignup();
  await act(async () => {});
  expect(screen.getByText('无法初始化验证')).toBeTruthy();
  fireEvent.submit(screen.getByLabelText('密码').closest('form')!);
  await act(async () => {});
  await act(async () => callbacks[0].callback('retry-token'));
  expect(fixture.signUp).toHaveBeenCalledTimes(1);
  expect(screen.getByText('请查收验证邮件，验证后即可登录。')).toBeTruthy();
});
