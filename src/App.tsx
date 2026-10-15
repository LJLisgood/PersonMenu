import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Menu, ChefHat, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Library } from './Library';
import { Detail } from './Detail';
import { Cooking } from './Cooking';
import { AddRecipe } from './AddRecipe';
import { assetUrl, parseRoute, routeHash, returnRoute } from './state';
import type { Manifest, RecipeDetail, Route } from './types';
import { Home } from './Home';
import { PersonalProvider, usePersonal } from './PersonalState';
import { CloudProvider, useCloud, loadCloudCatalog } from './Cloud';
import { AccountBar } from './AccountBar';
const Account = lazy(() => import('./Account').then((module) => ({ default: module.Account })));
const Requests = lazy(() => import('./Requests').then((module) => ({ default: module.Requests })));
const Admin = lazy(() => import('./Admin').then((module) => ({ default: module.Admin })));
const RecipeEditor = lazy(() =>
  import('./RecipeEditor').then((module) => ({ default: module.RecipeEditor })),
);
export function App() {
  return (
    <CloudProvider>
      <PersonalProvider>
        <Application />
      </PersonalProvider>
    </CloudProvider>
  );
}
function Application() {
  const cloud = useCloud();
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const { saved, notice, temporary, dismiss, visit } = usePersonal();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState('');
  const [route, setRoute] = useState(() => parseRoute(location.hash || '#/home'));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  const [detailAttempt, setDetailAttempt] = useState(0);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const sidebarReturnFocus = useRef<HTMLElement | null>(null);
  const openSidebar = () => {
    sidebarReturnFocus.current = document.activeElement as HTMLElement | null;
    setSidebarOpen(true);
  };
  const lastVisit = useRef('');
  useEffect(() => {
    if (!cloud.ready) return;
    setError('');
    const controller = new AbortController();
    const source = cloud.config.enabled
      ? loadCloudCatalog(cloud.api, controller.signal)
      : fetch(assetUrl('data/manifest.json'), { signal: controller.signal }).then((r) => {
          if (!r.ok) throw new Error('菜谱清单加载失败');
          return r.json();
        });
    source
      .then((data: Manifest) => {
        if (!controller.signal.aborted) setManifest(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted && e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [cloud.ready, cloud.config.enabled, cloud.api, catalogAttempt]);
  useEffect(() => {
    const update = () => {
      setRoute(parseRoute(location.hash || '#/home'));
      setSidebarOpen(false);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    if (!sidebarOpen) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener('keydown', escape);
      requestAnimationFrame(() => sidebarReturnFocus.current?.focus({ preventScroll: true }));
    };
  }, [sidebarOpen]);
  useEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    return () => {
      history.scrollRestoration = previous;
    };
  }, []);
  useEffect(() => {
    const desktop = matchMedia('(min-width: 961px)');
    const resize = () => {
      if (desktop.matches) setSidebarOpen(false);
    };
    desktop.addEventListener('change', resize);
    return () => desktop.removeEventListener('change', resize);
  }, []);
  const navigate = useCallback((next: Route, replace = false) => {
    const hash = routeHash(next);
    if (replace) {
      history.replaceState(null, '', hash);
      setRoute(next);
    } else if (location.hash !== hash) location.hash = hash;
  }, []);
  useEffect(() => {
    setDetail(null);
    setDetailError('');
    if (!manifest || !route.id || (route.page !== 'recipe' && route.page !== 'cook')) return;
    if (!manifest.recipes.some((r) => r.id === route.id)) {
      setDetailError('这道菜谱不存在，可能已被移动或移除。');
      return;
    }
    const controller = new AbortController();
    const source = manifest.cloud
      ? cloud.api<RecipeDetail>(`recipes/${encodeURIComponent(route.id)}`, {
          signal: controller.signal,
        })
      : fetch(assetUrl(`data/recipes/${encodeURIComponent(route.id)}.json`), {
          signal: controller.signal,
        }).then((r) => {
          if (!r.ok) throw new Error('菜谱详情加载失败');
          return r.json();
        });
    source
      .then((data: RecipeDetail) => {
        if (data.id !== route.id) throw new Error('菜谱详情与请求不一致，请重新加载');
        if (!controller.signal.aborted) setDetail(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted && e.name !== 'AbortError') setDetailError(e.message);
      });
    return () => controller.abort();
  }, [route.id, route.page, manifest, detailAttempt, cloud.api]);
  useEffect(() => {
    if (route.page !== 'recipe' && route.page !== 'cook') {
      lastVisit.current = '';
      return;
    }
    if (detail && detail.id === route.id && lastVisit.current !== detail.id) {
      lastVisit.current = detail.id;
      visit(detail.id);
    }
  }, [detail, route.id, route.page, visit]);
  useLayoutEffect(() => {
    if (
      route.page !== 'home' &&
      route.page !== 'library' &&
      route.page !== 'favorites' &&
      route.page !== 'recent'
    )
      window.scrollTo({ top: 0 });
    if (!manifest) return;
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [route.page, route.id, manifest]);
  useEffect(() => {
    document.title = detail ? `${detail.name} · 灶台笔记` : '灶台笔记 · 今天做点好吃的';
  }, [detail]);
  if (error || cloud.error)
    return (
      <div className="startup-state">
        <ChefHat size={40} />
        <h1>菜谱暂时没有加载成功</h1>
        <p>{error || cloud.error}</p>
        <button className="button primary" onClick={() => location.reload()}>
          重新加载
        </button>
      </div>
    );
  if (!manifest)
    return (
      <div className="startup-state">
        <ChefHat size={40} />
        <p>正在打开灶台笔记…</p>
      </div>
    );
  const detailContent =
    detail && detail.id === route.id ? (
      route.page === 'cook' ? (
        <Cooking key={detail.id} recipe={detail} route={route} />
      ) : (
        <Detail
          key={detail.id}
          recipe={detail}
          route={route}
          onPhotoSaved={() => setCatalogAttempt((n) => n + 1)}
        />
      )
    ) : (
      <div className="notice">
        {detailError || '正在打开这道菜谱…'}
        {detailError && (
          <>
            <button className="button subtle" onClick={() => setDetailAttempt((n) => n + 1)}>
              重试加载
            </button>
            <a href={routeHash(returnRoute(route))}>返回菜谱库</a>
          </>
        )}
      </div>
    );
  if (route.page === 'cook') return detailContent;
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        跳转到主要内容
      </a>
      <Sidebar
        manifest={manifest}
        route={route}
        navigate={navigate}
        open={sidebarOpen}
        close={() => {
          setSidebarOpen(false);
        }}
        favoriteCount={manifest.recipes.filter((r) => saved.favorites.includes(r.id)).length}
      />
      <header className="site-header" inert={sidebarOpen}>
        <a className="mobile-brand" href="#/home">
          <ChefHat size={22} />
          灶台笔记
        </a>
        <button
          className="icon-button mobile-menu-trigger"
          ref={menuTrigger}
          aria-expanded={sidebarOpen}
          aria-controls="recipe-sidebar"
          aria-label="打开分类导航"
          onClick={openSidebar}
        >
          <Menu size={23} />
        </button>
        <AccountBar />
      </header>
      <main className="workspace" id="main-content" tabIndex={-1} inert={sidebarOpen}>
        {temporary && (
          <p className="storage-warning" role="status">
            浏览器存储不可用，收藏与浏览记录暂存于当前页面，关闭后可能丢失。
          </p>
        )}
        <Suspense fallback={<p className="notice">正在打开小厨房…</p>}>
          {route.page === 'account' ? (
            <Account />
          ) : route.page === 'requests' ? (
            <Requests manifest={manifest} initialId={route.id} />
          ) : route.page === 'admin' ? (
            <Admin catalog={manifest} onChanged={() => setCatalogAttempt((n) => n + 1)} />
          ) : route.page === 'home' ? (
            <Home manifest={manifest} route={route} navigate={navigate} />
          ) : route.page === 'library' || route.page === 'favorites' || route.page === 'recent' ? (
            <Library
              manifest={manifest}
              route={route}
              navigate={navigate}
              openSidebar={openSidebar}
            />
          ) : route.page === 'add' ? (
            cloud.config.enabled ? (
              <section className="cloud-page">
                <header>
                  <h1>{cloud.admin ? '新增菜谱' : '分享你的拿手菜'}</h1>
                  <p>{cloud.admin ? '在这里保存草稿或直接发布。' : '提交后由管理员审核发布。'}</p>
                </header>
                <RecipeEditor
                  catalog={manifest}
                  key={cloud.session?.user.id ?? 'visitor'}
                  submission={!cloud.admin}
                  onSaved={() => {
                    setCatalogAttempt((n) => n + 1);
                    if (cloud.admin) navigate({ ...route, page: 'admin', id: undefined });
                  }}
                />
              </section>
            ) : (
              <AddRecipe route={route} />
            )
          ) : (
            detailContent
          )}
        </Suspense>
      </main>
      <div className="feedback-region" role="status" aria-live="polite">
        {notice && (
          <div className="feedback-toast">
            <span>
              {notice}
              {temporary ? '（本次页面有效）' : cloud.config.enabled ? '' : '（仅此浏览器）'}
            </span>
            <button className="icon-button" aria-label="关闭提示" onClick={dismiss}>
              <X size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
