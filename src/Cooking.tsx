import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Pause,
  RotateCcw,
  Maximize,
  Minimize,
  Sun,
  BookOpen,
} from 'lucide-react';
import { Markdown } from './Markdown';
import { acquireWakeLock } from './platform';
import { cookRemaining, loadCooking, persistCooking, routeHash } from './state';
import type { RecipeDetail, Route } from './types';
export function Cooking({ recipe, route }: { recipe: RecipeDetail; route: Route }) {
  const [state, setState] = useState(() => loadCooking(recipe.id, recipe.steps.length));
  const [remaining, setRemaining] = useState(() => cookRemaining(state.endAt));
  const [original, setOriginal] = useState(!recipe.steps.length);
  const [wake, setWake] = useState('');
  const [wakeOn, setWakeOn] = useState(false);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const wakeRequested = useRef(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState('');
  const audio = useRef<AudioContext | null>(null);
  const sounded = useRef<number | null>(null);
  const current = recipe.steps[state.step];
  useEffect(() => {
    persistCooking(recipe.id, state);
  }, [recipe.id, state]);
  useEffect(() => {
    const update = () => {
      const seconds = cookRemaining(state.endAt);
      setRemaining(seconds);
      if (state.endAt && seconds === 0 && sounded.current !== state.endAt) {
        sounded.current = state.endAt;
        setNotice('计时结束，可以看看锅里的状态了。');
        const context = audio.current;
        if (context && context.state === 'running') {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.connect(gain);
          gain.connect(context.destination);
          gain.gain.value = 0.12;
          oscillator.frequency.value = 660;
          oscillator.start();
          oscillator.stop(context.currentTime + 0.6);
        }
      }
    };
    update();
    const interval = setInterval(update, 500);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
    };
  }, [state.endAt]);
  useEffect(() => {
    const change = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', change);
    return () => {
      document.removeEventListener('fullscreenchange', change);
      wakeRequested.current = false;
      void wakeRef.current?.release();
      void audio.current?.close();
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === 'visible' && wakeRequested.current) void requestWake();
    };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, []);
  const requestWake = async () => {
    const result = await acquireWakeLock();
    setWake(result.message);
    if (!result.sentinel) {
      wakeRequested.current = false;
      setWakeOn(false);
      return;
    }
    const sentinel = result.sentinel;
    if (!wakeRequested.current) {
      await sentinel.release();
      return;
    }
    wakeRef.current = sentinel;
    setWakeOn(true);
    sentinel.addEventListener('release', () => setWakeOn(false));
  };
  const toggleWake = async () => {
    if (wakeRequested.current) {
      wakeRequested.current = false;
      await wakeRef.current?.release();
      setWake('屏幕常亮已关闭');
      setWakeOn(false);
    } else {
      wakeRequested.current = true;
      await requestWake();
    }
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen();
      else setNotice('当前浏览器不支持全屏，可直接使用大字视图。');
    } catch {
      setNotice('当前浏览器暂时无法进入全屏。');
    }
  };
  const startTimer = () => {
    setNotice('');
    if (
      !Number.isFinite(state.timerMinutes) ||
      state.timerMinutes <= 0 ||
      state.timerMinutes > 180
    ) {
      setNotice('计时请输入 1 到 180 分钟。');
      return;
    }
    try {
      if (!audio.current) audio.current = new AudioContext();
      void audio.current.resume();
    } catch {
      /* A visual timer remains available without audio. */
    }
    setState({ ...state, endAt: Date.now() + state.timerMinutes * 60_000 });
  };
  return (
    <div className="cook-shell">
      <header className="cook-header">
        <a className="back-link" href={routeHash({ ...route, page: 'recipe' })}>
          <ArrowLeft size={18} />
          退出烹饪
        </a>
        <div className="cook-tools">
          <button className={`button subtle ${wakeOn ? 'on' : ''}`} onClick={toggleWake}>
            <Sun size={18} />
            <span>屏幕常亮</span>
          </button>
          <button
            className="icon-button"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? '退出全屏' : '全屏'}
          >
            {fullscreen ? <Minimize size={21} /> : <Maximize size={21} />}
          </button>
        </div>
      </header>
      <div className="cook-title">
        <span>{recipe.category} · 烹饪中</span>
        <h1>{recipe.name}</h1>
        <button className="text-button" onClick={() => setOriginal(!original)}>
          <BookOpen size={16} />
          {original && recipe.steps.length ? '回到分步模式' : '阅读完整原文'}
        </button>
      </div>
      {wake && (
        <p className="cook-notice" role="status">
          {wake}
        </p>
      )}
      <div className="cook-layout">
        <main className="cook-main">
          {!original && current ? (
            <>
              <div className="step-count">
                步骤 <strong>{String(state.step + 1).padStart(2, '0')}</strong>
                <span>/ {recipe.steps.length}</span>
              </div>
              <div className="step-progress">
                {recipe.steps.map((step, i) => (
                  <button
                    key={step.id}
                    className={i === state.step ? 'active' : i < state.step ? 'done' : ''}
                    aria-label={`前往步骤 ${i + 1}`}
                    onClick={() => setState({ ...state, step: i })}
                  />
                ))}
              </div>
              <Markdown html={current.html} className="cooking-step" />
              <div className="step-navigation">
                <button
                  className="button subtle"
                  disabled={state.step === 0}
                  onClick={() => setState({ ...state, step: state.step - 1 })}
                >
                  <ArrowLeft size={18} />
                  上一步
                </button>
                {state.step < recipe.steps.length - 1 ? (
                  <button
                    className="button primary"
                    onClick={() => setState({ ...state, step: state.step + 1 })}
                  >
                    下一步
                    <ArrowRight size={19} />
                  </button>
                ) : (
                  <button
                    className="button primary"
                    onClick={() => setNotice('这道菜完成了，趁热享用。')}
                  >
                    <Check size={19} />
                    完成烹饪
                  </button>
                )}
              </div>
              <details className="supporting-notes">
                <summary>
                  查看食材用量与备注
                  <Chevron />
                </summary>
                {recipe.supporting.map((section, i) => (
                  <section key={i}>
                    <h3>{section.name}</h3>
                    <Markdown html={section.html} />
                  </section>
                ))}
              </details>
            </>
          ) : (
            <>
              <div className="original-notice">
                {!recipe.steps.length
                  ? '这道菜保留原文阅读，请按原文说明操作。'
                  : '完整原文 · 包含食材、计算与全部说明'}
              </div>
              <Markdown html={recipe.html} className="cooking-original" />
            </>
          )}
        </main>
        <aside className="cook-aside">
          <section className="timer-panel">
            <h2>
              <Clock size={20} />
              厨房计时器
            </h2>
            <div
              className={`timer-digits ${state.endAt && remaining === 0 ? 'finished' : ''}`}
              role="timer"
            >
              {String(Math.floor(remaining / 60)).padStart(2, '0')}
              <span>:</span>
              {String(remaining % 60).padStart(2, '0')}
            </div>
            <label className="timer-input">
              设置
              <input
                type="number"
                aria-label="计时分钟"
                min="1"
                max="180"
                value={state.timerMinutes}
                onChange={(e) => setState({ ...state, timerMinutes: Number(e.target.value) })}
              />
              分钟
            </label>
            <div className="timer-actions">
              {state.endAt && remaining > 0 ? (
                <button
                  className="button subtle"
                  onClick={() => {
                    setState({ ...state, endAt: null });
                    setNotice('计时已停止');
                  }}
                >
                  <Pause size={16} />
                  停止
                </button>
              ) : (
                <button className="button primary" onClick={startTimer}>
                  开始计时
                </button>
              )}
              <button
                className="icon-button"
                aria-label="重置计时"
                onClick={() => {
                  setState({ ...state, endAt: null });
                  setNotice('');
                }}
              >
                <RotateCcw size={18} />
              </button>
            </div>
            <small>保持页面打开以接收提醒。</small>
          </section>
          <section className="ingredient-panel">
            <h2>
              备料清单
              <span>
                {state.checked.length} / {recipe.ingredients.length}
              </span>
            </h2>
            {recipe.ingredients.length ? (
              recipe.ingredients.map((ingredient, i) => {
                const key = String(i);
                return (
                  <label key={key} className={state.checked.includes(key) ? 'checked' : ''}>
                    <input
                      type="checkbox"
                      checked={state.checked.includes(key)}
                      onChange={() =>
                        setState({
                          ...state,
                          checked: state.checked.includes(key)
                            ? state.checked.filter((x) => x !== key)
                            : [...state.checked, key],
                        })
                      }
                    />
                    <span>{ingredient}</span>
                  </label>
                );
              })
            ) : (
              <p>请查看原文中的备料说明。</p>
            )}
          </section>
        </aside>
      </div>
      {notice && (
        <div className="cook-status" role="status" aria-live="polite">
          {notice}
          <button className="text-button" onClick={() => setNotice('')}>
            知道了
          </button>
        </div>
      )}
    </div>
  );
}
function Chevron() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor">
      <path d="m3 6 5 5 5-5" />
    </svg>
  );
}
