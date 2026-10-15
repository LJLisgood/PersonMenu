import { useEffect, useState } from 'react';
import { useCloud } from './Cloud';
import { RecipeEditor } from './RecipeEditor';
import { PrivatePhoto } from './PrivatePhoto';
import {
  requestLabels,
  stateLabels,
  type KitchenRequest,
  type Notification,
  type RecipeRecord,
  type RequestState,
} from '../shared/cloud';
import type { RecipeDetail } from './types';
export function Admin({ onChanged }: { onChanged: () => void }) {
  const cloud = useCloud();
  const [tab, setTab] = useState<'requests' | 'recipes' | 'notifications'>('requests');
  const [requests, setRequests] = useState<KitchenRequest[]>([]),
    [recipes, setRecipes] = useState<RecipeRecord[]>([]),
    [notifications, setNotifications] = useState<Notification[]>([]);
  const [editing, setEditing] = useState<RecipeRecord | 'new' | null>(null),
    [draft, setDraft] = useState<RecipeDetail | undefined>(),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState('');
  const [requestPage, setRequestPage] = useState(0),
    [notificationPage, setNotificationPage] = useState(0);
  const [moreRequests, setMoreRequests] = useState(false),
    [moreNotifications, setMoreNotifications] = useState(false);
  const allRecipes = async () => {
    const rows: RecipeRecord[] = [];
    for (let page = 0; page < 1000; page++) {
      const batch = await cloud.api<RecipeRecord[]>(`admin/recipes?page=${page}`);
      rows.push(...batch);
      if (batch.length < 100) break;
    }
    return rows;
  };
  const load = () => {
    if (cloud.admin)
      void Promise.all([
        cloud.api<KitchenRequest[]>('admin/requests'),
        allRecipes(),
        cloud.api<Notification[]>('admin/notifications'),
      ])
        .then(([a, b, c]) => {
          setRequests(a);
          setRecipes(b);
          setNotifications(c);
          setRequestPage(0);
          setNotificationPage(0);
          setMoreRequests(a.length === 100);
          setMoreNotifications(c.length === 100);
        })
        .catch((e) => setNotice(e.message));
  };
  useEffect(load, [cloud.admin, cloud.api]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setNotice('');
    try {
      await action();
      load();
      onChanged();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };
  if (!cloud.admin)
    return (
      <section className="cloud-page">
        <h1>管理员工作台</h1>
        <p>请使用已授权的管理员账号登录。</p>
        <a className="button primary" href="#/account">
          前往登录
        </a>
      </section>
    );
  return (
    <section className="cloud-page">
      <header>
        <span className="eyebrow">小厨房管理</span>
        <h1>管理员工作台</h1>
        <p>处理亲友申请，维护正式菜谱，查看通知结果。</p>
      </header>
      <div className="cloud-tabs">
        {(
          [
            ['requests', '点菜与投稿'],
            ['recipes', '菜谱管理'],
            ['notifications', '邮件通知'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => {
              setTab(key);
              setEditing(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {tab === 'recipes' ? (
        editing ? (
          <RecipeEditor
            key={editing === 'new' ? `new-${draft?.id ?? ''}` : editing.id}
            record={editing === 'new' ? undefined : editing}
            initial={draft}
            onSaved={() => {
              setEditing(null);
              setDraft(undefined);
              load();
              onChanged();
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <>
            <div className="cloud-actions">
              <button
                className="button primary"
                onClick={() => {
                  setDraft(undefined);
                  setEditing('new');
                }}
              >
                新增菜谱
              </button>
              <label>
                查找菜谱
                <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} />
              </label>
            </div>
            {recipes
              .filter((r) => r.document.name.includes(filter))
              .map((r) => (
                <article key={r.id} className="request-row">
                  <div>
                    <strong>{r.document.name}</strong>
                    <p>
                      {r.document.category} ·{' '}
                      {r.state === 'published' ? '已发布' : r.state === 'draft' ? '草稿' : '回收站'}{' '}
                      · 版本 {r.revision}
                    </p>
                  </div>
                  <div className="cloud-actions">
                    <button
                      className="button subtle"
                      onClick={() => {
                        setDraft(undefined);
                        setEditing(r);
                      }}
                    >
                      编辑
                    </button>
                    <button
                      className="button subtle"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          cloud.api(`admin/recipes/${r.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({
                              revision: r.revision,
                              state: r.state === 'published' ? 'draft' : 'published',
                            }),
                          }),
                        )
                      }
                    >
                      {r.state === 'published' ? '下架' : '发布'}
                    </button>
                    {r.state !== 'deleted' && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            cloud.api(`admin/recipes/${r.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ revision: r.revision, state: 'deleted' }),
                            }),
                          )
                        }
                      >
                        移入回收站
                      </button>
                    )}
                  </div>
                </article>
              ))}
          </>
        )
      ) : tab === 'notifications' ? (
        <div className="cloud-panel">
          <p>
            邮件失败不影响申请保存。发送结果不确定时会复用同一幂等编号；超过安全重试窗口的记录需人工核对。
          </p>
          {notifications.map((n) => (
            <article className="request-row" key={n.id}>
              <div>
                <strong>申请 {n.request_id}</strong>
                <p>
                  {n.state === 'sent'
                    ? '已发送'
                    : n.state === 'sending'
                      ? '发送中'
                      : n.attempts > 0 && Date.now() - Date.parse(n.created_at) > 23 * 3600000
                        ? '待人工核对'
                        : n.state === 'pending'
                          ? '待发送'
                          : '发送失败'}{' '}
                  · 尝试 {n.attempts} 次
                </p>
                <small>{n.last_error}</small>
              </div>
              {n.state !== 'sent' && (
                <button
                  className="button subtle"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await cloud.api<{ sent: boolean }>(
                        `admin/notifications/${n.id}`,
                        { method: 'POST' },
                      );
                      if (!result.sent)
                        throw new Error('未确认发送成功。请检查配置、发送中状态或重试窗口。');
                    })
                  }
                >
                  重试通知
                </button>
              )}
            </article>
          ))}
          {moreNotifications && (
            <button
              className="button subtle"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void (async () => {
                  const rows = await cloud.api<Notification[]>(
                    `admin/notifications?page=${notificationPage + 1}`,
                  );
                  setNotifications((s) => [
                    ...s,
                    ...rows.filter((r) => !s.some((x) => x.id === r.id)),
                  ]);
                  setNotificationPage((p) => p + 1);
                  setMoreNotifications(rows.length === 100);
                })()
                  .catch((error) => setNotice(error.message))
                  .finally(() => setBusy(false));
              }}
            >
              加载更多通知
            </button>
          )}
        </div>
      ) : (
        <div className="cloud-panel">
          {!requests.length && <p>目前没有申请。</p>}
          {requests.map((item) => (
            <RequestReview
              key={item.id}
              item={item}
              busy={busy}
              onUpdate={(state, note) =>
                void run(() =>
                  cloud.api(`admin/requests/${item.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ state, note }),
                  }),
                )
              }
              onAdopt={() => {
                setDraft(item.payload.recipe);
                setEditing('new');
                setTab('recipes');
              }}
              onPhoto={(note) =>
                void run(() =>
                  cloud.api(`admin/requests/${item.id}/photo`, {
                    method: 'POST',
                    body: JSON.stringify({ note }),
                  }),
                )
              }
            />
          ))}
          {moreRequests && (
            <button
              className="button subtle"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void cloud
                  .api<KitchenRequest[]>(`admin/requests?page=${requestPage + 1}`)
                  .then((rows) => {
                    setRequests((s) => [
                      ...s,
                      ...rows.filter((r) => !s.some((x) => x.id === r.id)),
                    ]);
                    setRequestPage((p) => p + 1);
                    setMoreRequests(rows.length === 100);
                  })
                  .catch((e) => setNotice(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              加载更多申请
            </button>
          )}
        </div>
      )}
    </section>
  );
}
function RequestReview({
  item,
  busy,
  onUpdate,
  onAdopt,
  onPhoto,
}: {
  item: KitchenRequest;
  busy: boolean;
  onUpdate: (state: RequestState, note: string) => void;
  onAdopt: () => void;
  onPhoto: (note: string) => void;
}) {
  const [state, setState] = useState(item.state),
    [note, setNote] = useState(item.admin_note);
  useEffect(() => {
    setState(item.state);
    setNote(item.admin_note);
  }, [item.state, item.admin_note]);
  return (
    <article className="review-card">
      <header>
        <strong>
          {requestLabels[item.kind]} · {item.nickname}
        </strong>
        <span className="state-pill">{stateLabels[item.state]}</span>
      </header>
      <h3>{item.payload.title || item.payload.dishes?.map((d) => d.name).join('、')}</h3>
      <p>
        {item.payload.date}{' '}
        {item.payload.meal === 'lunch' ? '午餐' : item.payload.meal === 'dinner' ? '晚餐' : ''}{' '}
        {item.payload.people ? `${item.payload.people} 人` : ''}
      </p>
      <p>{item.payload.notes}</p>
      {item.contact_email && <p>联系邮箱：{item.contact_email}</p>}
      {item.payload.reference && (
        <a className="text-button" href={item.payload.reference} target="_blank" rel="noreferrer">
          查看参考链接
        </a>
      )}
      <small>{new Date(item.created_at).toLocaleString()}</small>
      {item.payload.photo && (
        <div className="photo-review">
          <PrivatePhoto url={item.payload.photo.url} />
          <a
            className="text-button"
            href={`#/recipe/${encodeURIComponent(item.payload.photo.recipeId)}`}
          >
            查看对应菜谱
          </a>
          {['pending', 'accepted'].includes(item.state) && (
            <button className="button primary" disabled={busy} onClick={() => onPhoto(note)}>
              采纳为菜谱封面
            </button>
          )}
        </div>
      )}
      {item.payload.recipe && (
        <>
          <details>
            <summary>查看投稿原文</summary>
            <pre className="submitted-source">{item.payload.recipe.original}</pre>
          </details>
          <button className="button subtle" onClick={onAdopt}>
            编辑为正式菜谱
          </button>
        </>
      )}
      <div className="form-columns">
        <label>
          处理状态
          <select
            value={state}
            disabled={item.kind === 'photo' && item.state === 'completed'}
            onChange={(e) => setState(e.target.value as RequestState)}
          >
            {Object.entries(stateLabels)
              .filter(
                ([value]) =>
                  item.kind !== 'photo' || value !== 'completed' || item.state === 'completed',
              )
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        <label>
          给申请人的备注
          <input maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <button
        className="button primary"
        disabled={busy || (item.kind === 'photo' && item.state === 'completed')}
        onClick={() => onUpdate(state, note)}
      >
        保存处理结果
      </button>
    </article>
  );
}
