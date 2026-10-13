import { useCallback, useEffect, useState } from 'react';
import { Menu, ChefHat } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Library } from './Library';
import { Detail } from './Detail';
import { Cooking } from './Cooking';
import { AddRecipe } from './AddRecipe';
import { assetUrl, parseRoute, routeHash } from './state';
import type { Manifest, RecipeDetail, Route } from './types';
export function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState('');
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(assetUrl('data/manifest.json'), { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('菜谱清单加载失败');
        return r.json();
      })
      .then(setManifest)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const update = () => {
      setRoute(parseRoute(location.hash));
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
    };
  }, [sidebarOpen]);
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
    fetch(assetUrl(`data/recipes/${encodeURIComponent(route.id)}.json`), {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error('菜谱详情加载失败');
        return r.json();
      })
      .then(setDetail)
      .catch((e) => {
        if (e.name !== 'AbortError') setDetailError(e.message);
      });
    return () => controller.abort();
  }, [route.id, route.page, manifest]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.page, route.id]);
  useEffect(() => {
    document.title = detail ? `${detail.name} · 灶台笔记` : '灶台笔记 · 今天做点好吃的';
  }, [detail]);
  if (error)
    return (
      <div className="startup-state">
        <ChefHat size={40} />
        <h1>菜谱暂时没有加载成功</h1>
        <p>{error}</p>
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
        <Detail recipe={detail} route={route} />
      )
    ) : (
      <div className="notice">
        {detailError || '正在打开这道菜谱…'}
        {detailError && (
          <a href={routeHash({ ...route, page: 'library', id: undefined })}>返回菜谱库</a>
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
        close={() => setSidebarOpen(false)}
      />
      <div className="mobile-header">
        <a href="#/">
          <ChefHat size={22} />
          灶台笔记
        </a>
        <button
          className="icon-button"
          aria-label="打开分类导航"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu size={23} />
        </button>
      </div>
      <main className="workspace" id="main-content" tabIndex={-1}>
        {route.page === 'library' ? (
          <Library
            manifest={manifest}
            route={route}
            navigate={navigate}
            openSidebar={() => setSidebarOpen(true)}
          />
        ) : route.page === 'add' ? (
          <AddRecipe route={route} />
        ) : (
          detailContent
        )}
      </main>
    </div>
  );
}
