import { useState } from 'react';
import { UserRound, LogOut } from 'lucide-react';
import { useCloud } from './Cloud';

export function AccountBar() {
  const cloud = useCloud();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!cloud.config.enabled) return null;
  const user = cloud.session?.user;
  const label = !user ? '未登录访客' : user.is_anonymous ? '游客登录' : '用户登录';
  return (
    <nav className="account-bar" aria-label="账号操作">
      <div className="account-identity" role="status">
        <UserRound size={18} aria-hidden="true" />
        <span>
          <strong>
            {label}
            {cloud.admin ? ' · 管理员' : ''}
          </strong>
          {user && !user.is_anonymous && <small title={user.email}>{user.email}</small>}
        </span>
      </div>
      <a className="button subtle" href="#/account">
        {user && !user.is_anonymous ? '我的账号' : '登录 / 注册'}
      </a>
      {user && (
        <button
          className="button subtle account-signout"
          disabled={busy}
          onClick={async () => {
            if (!cloud.client || busy) return;
            setBusy(true);
            setError('');
            try {
              const result = await cloud.client.auth.signOut();
              if (result.error) throw result.error;
            } catch (failure) {
              setError(failure instanceof Error ? failure.message : '退出失败，请重试');
            } finally {
              setBusy(false);
            }
          }}
        >
          <LogOut size={16} />
          {busy ? '正在退出…' : '退出登录'}
        </button>
      )}
      {error && (
        <span className="account-error" role="alert">
          {error}
        </span>
      )}
    </nav>
  );
}
