import { useState, type FormEvent } from 'react';
import { useCloud } from './Cloud';
import { useCaptcha } from './Captcha';
export function Account() {
  const cloud = useCloud(),
    captcha = useCaptcha();
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const execute = async (event: FormEvent) => {
    event.preventDefault();
    if (!cloud.client || busy) return;
    setBusy(true);
    setNotice('');
    cloud.clearAuthNotice?.();
    try {
      if (cloud.recovery) {
        const result = await cloud.client.auth.updateUser({ password });
        if (result.error) throw result.error;
        setPassword('');
        cloud.clearRecovery();
        setNotice('密码已更新。');
      } else {
        const token = await captcha.challenge();
        const callback = new URL(location.pathname, location.origin);
        if (mode === 'forgot') callback.searchParams.set('auth', 'recovery');
        const result =
          mode === 'login'
            ? await cloud.client.auth.signInWithPassword({
                email,
                password,
                options: { captchaToken: token },
              })
            : mode === 'signup'
              ? await cloud.client.auth.signUp({
                  email,
                  password,
                  options: { emailRedirectTo: callback.href, captchaToken: token },
                })
              : await cloud.client.auth.resetPasswordForEmail(email, {
                  redirectTo: callback.href,
                  captchaToken: token,
                });
        if (result.error) throw result.error;
        setPassword('');
        setNotice(
          mode === 'signup'
            ? '请查收验证邮件，验证后即可登录。'
            : mode === 'forgot'
              ? '如果邮箱已注册，你会收到密码重置邮件。'
              : '登录成功。',
        );
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };
  if (!cloud.config.enabled)
    return (
      <section className="cloud-page">
        <h1>账号</h1>
        <p>线上服务尚未启用，目前可以继续浏览本地菜谱。</p>
      </section>
    );
  return (
    <section className="cloud-page narrow">
      <header>
        <span className="eyebrow">你的小厨房</span>
        <h1>{cloud.recovery ? '设置新密码' : '账号与登录'}</h1>
        <p>登录后可找回自己的申请。游客无需注册，也能点菜和投稿。</p>
      </header>
      {cloud.session && !cloud.session.user.is_anonymous && !cloud.recovery ? (
        <div className="cloud-panel">
          <h2>已经登录</h2>
          <p>{cloud.session.user.email}</p>
          <p>{cloud.admin ? '你是这座小厨房的管理员。' : '欢迎来小厨房坐坐。'}</p>
          <div className="cloud-actions">
            <a className="button primary" href="#/requests">
              我的点菜和投稿
            </a>
            {cloud.admin && (
              <a className="button subtle" href="#/admin">
                管理员工作台
              </a>
            )}
          </div>
        </div>
      ) : (
        <form className="cloud-form" onSubmit={execute} aria-busy={busy}>
          {!cloud.recovery && (
            <div className="cloud-tabs">
              {(
                [
                  ['login', '登录'],
                  ['signup', '注册'],
                  ['forgot', '忘记密码'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  disabled={busy}
                  onClick={() => {
                    setMode(value);
                    setNotice('');
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {!cloud.recovery && (
            <label>
              邮箱
              <input
                type="email"
                autoComplete="email"
                required
                disabled={busy}
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {(cloud.recovery || mode !== 'forgot') && (
            <div>
              <label htmlFor="account-password">
                {cloud.recovery ? '新密码' : '密码'}
                <input
                  id="account-password"
                  aria-describedby="account-password-hint"
                  type="password"
                  minLength={8}
                  maxLength={128}
                  required
                  disabled={busy}
                  autoComplete={
                    cloud.recovery || mode === 'signup' ? 'new-password' : 'current-password'
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <small id="account-password-hint">至少 8 个字符。</small>
            </div>
          )}
          <div ref={captcha.element} />
          {busy && (captcha.status === 'loading' || captcha.status === 'verifying') && (
            <>
              <p className="cloud-hint" role="status">
                {captcha.status === 'loading'
                  ? '正在加载人机验证，请稍候。'
                  : '请完成上方的人机验证，通过后会继续提交。'}
              </p>
              <button className="button subtle" type="button" onClick={captcha.cancel}>
                取消验证
              </button>
            </>
          )}
          <button className="button primary" disabled={busy}>
            {busy
              ? captcha.status === 'loading'
                ? '正在加载验证…'
                : captcha.status === 'verifying'
                  ? '等待验证通过…'
                  : '正在提交…'
              : cloud.recovery
                ? '保存新密码'
                : mode === 'signup'
                  ? '注册并发送验证邮件'
                  : mode === 'forgot'
                    ? '发送密码重置邮件'
                    : '登录'}
          </button>
        </form>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <p className="cloud-hint">
        登录后使用该账号的云端收藏，本机游客收藏单独保留。登录已有账号不会自动合并游客申请记录。
      </p>
      {cloud.session?.user.is_anonymous && (
        <p className="cloud-hint">
          当前为游客身份。换设备、退出或清理浏览器后，游客申请记录不能自动找回。
        </p>
      )}
      {cloud.authNotice && (
        <p className="notice" role="status">
          {cloud.authNotice}
        </p>
      )}
    </section>
  );
}
