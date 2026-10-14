import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useCloud } from './Cloud';
import { useCaptcha } from './Captcha';
import type { Manifest } from './types';
import { requestLabels, stateLabels, type KitchenRequest } from '../shared/cloud';
import { RecipeEditor } from './RecipeEditor';
export function Requests({ manifest, initialId }: { manifest: Manifest; initialId?: string }) {
  const cloud = useCloud(),
    captcha = useCaptcha();
  const [kind, setKind] = useState<'meal' | 'wish' | 'submission'>('meal');
  const [selected, setSelected] = useState<string[]>(initialId ? [initialId] : []),
    [filter, setFilter] = useState('');
  const [date, setDate] = useState(() =>
      new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }),
    ),
    [meal, setMeal] = useState('dinner'),
    [people, setPeople] = useState('2');
  const [nickname, setNickname] = useState(''),
    [email, setEmail] = useState(''),
    [title, setTitle] = useState(''),
    [reference, setReference] = useState(''),
    [notes, setNotes] = useState('');
  const [id, setId] = useState(() => crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [history, setHistory] = useState<KitchenRequest[]>([]);
  const [historyError, setHistoryError] = useState('');
  const owner = cloud.session?.user.id;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const [historyPage, setHistoryPage] = useState(0),
    [more, setMore] = useState(false);
  const load = (page = 0) => {
    const loadingOwner = currentOwner.current;
    if (loadingOwner)
      void cloud
        .api<KitchenRequest[]>(`requests?page=${page}`)
        .then((rows) => {
          if (currentOwner.current !== loadingOwner) return;
          setHistory((s) =>
            page ? [...s, ...rows.filter((r) => !s.some((x) => x.id === r.id))] : rows,
          );
          setHistoryPage(page);
          setMore(rows.length === 100);
          setHistoryError('');
        })
        .catch((e) => {
          if (currentOwner.current === loadingOwner) setHistoryError(e.message);
        });
  };
  useEffect(() => {
    setHistory([]);
    setMore(false);
    load();
  }, [owner, cloud.api]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const session = await cloud.ensureGuest(captcha.challenge);
      const result = await cloud.api<{ notification: string }>('requests', {
        method: 'POST',
        body: JSON.stringify({
          id,
          kind,
          nickname,
          email,
          payload:
            kind === 'meal'
              ? { recipeIds: selected, date, meal, people: Number(people), notes }
              : { title, reference, notes },
          captcha: session.user.is_anonymous ? await captcha.challenge() : '',
        }),
      });
      setId(crypto.randomUUID());
      setSelected([]);
      setNotes('');
      load();
      setNotice(
        `申请已保存。${result.notification === 'sent' ? '管理员已收到邮件提醒。' : '邮件提醒暂未发出，管理员仍可在工作台查看。'}`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '提交失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="cloud-page">
      <header>
        <span className="eyebrow">今天想吃什么</span>
        <h1>点菜与投稿</h1>
        <p>选一餐想吃的菜，也可以分享你的拿手菜，等管理员确认。</p>
      </header>
      <div className="cloud-tabs">
        {(['meal', 'wish', 'submission'] as const).map((value) => (
          <button
            key={value}
            aria-pressed={kind === value}
            onClick={() => {
              setKind(value);
              setId(crypto.randomUUID());
            }}
          >
            {requestLabels[value]}
          </button>
        ))}
      </div>
      {kind === 'submission' ? (
        <RecipeEditor key={owner ?? 'visitor'} submission onSaved={() => load()} />
      ) : (
        <form className="cloud-form" onSubmit={submit}>
          {kind === 'meal' ? (
            <>
              <label>
                查找想吃的菜
                <input
                  type="search"
                  placeholder="搜索菜名"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
              <p>已选 {selected.length} 道菜（最多 20 道）</p>
              <div className="dish-picker">
                {manifest.recipes
                  .filter((r) => !filter || r.name.includes(filter) || selected.includes(r.id))
                  .map((r) => (
                    <label key={r.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(r.id)}
                        disabled={!selected.includes(r.id) && selected.length >= 20}
                        onChange={() =>
                          setSelected((s) =>
                            s.includes(r.id) ? s.filter((v) => v !== r.id) : [...s, r.id],
                          )
                        }
                      />
                      {r.name}
                    </label>
                  ))}
              </div>
              <div className="form-columns thirds">
                <label>
                  用餐日期
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label>
                  餐次
                  <select value={meal} onChange={(e) => setMeal(e.target.value)}>
                    <option value="lunch">午餐</option>
                    <option value="dinner">晚餐</option>
                  </select>
                </label>
                <label>
                  人数
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={people}
                    onChange={(e) => setPeople(e.target.value)}
                  />
                </label>
              </div>
            </>
          ) : (
            <>
              <label>
                想吃的菜名
                <input
                  maxLength={100}
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                参考链接（可选）
                <input
                  type="url"
                  maxLength={500}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
            </>
          )}
          <label>
            口味或其他备注
            <textarea
              maxLength={2000}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="form-columns">
            <label>
              你的昵称
              <input
                required
                maxLength={40}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </label>
            <label>
              联系邮箱（可选，仅管理员可见）
              <input
                type="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          </div>
          <div ref={captcha.element} />
          <button
            className="button primary"
            disabled={busy || (kind === 'meal' && !selected.length)}
          >
            {busy ? '正在提交…' : '提交给小厨房'}
          </button>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
        </form>
      )}
      <section className="cloud-panel">
        <h2>我的申请</h2>
        <p className="cloud-hint">
          游客记录仅凭当前浏览器的身份查看。换设备或清理浏览器后不能自动找回。
        </p>
        {historyError && <p role="alert">{historyError}</p>}
        {!history.length ? (
          <p>还没有申请，提交后会显示在这里。</p>
        ) : (
          history.map((item) => (
            <article className="request-row" key={item.id}>
              <div>
                <strong>
                  {requestLabels[item.kind]} ·{' '}
                  {item.payload.title || item.payload.dishes?.map((d) => d.name).join('、')}
                </strong>
                <p>
                  {item.payload.date}{' '}
                  {item.payload.meal === 'lunch'
                    ? '午餐'
                    : item.payload.meal === 'dinner'
                      ? '晚餐'
                      : ''}{' '}
                  {item.payload.people ? `${item.payload.people} 人` : ''}
                </p>
                <small>{new Date(item.created_at).toLocaleString()}</small>
                {item.admin_note && <p>管理员：{item.admin_note}</p>}
              </div>
              <span className="state-pill">{stateLabels[item.state]}</span>
            </article>
          ))
        )}
        {more && (
          <button className="button subtle" onClick={() => load(historyPage + 1)}>
            加载更多申请
          </button>
        )}
      </section>
    </section>
  );
}
