import { useEffect, useRef } from 'react';
import { emptyFilters } from './state';
import {
  BookOpen,
  House,
  Heart,
  History,
  ChefHat,
  Leaf,
  Beef,
  Fish,
  Coffee,
  Soup,
  CakeSlice,
  GlassWater,
  Wheat,
  Package,
  SlidersHorizontal,
  Grid2X2,
  X,
} from 'lucide-react';
import type { Manifest, Route } from './types';
import { useCloud } from './Cloud';
const icons: Record<string, typeof Leaf> = {
  素菜: Leaf,
  荤菜: Beef,
  水产: Fish,
  早餐: Coffee,
  主食: Wheat,
  汤: Soup,
  甜品: CakeSlice,
  饮品: GlassWater,
  调味料: SlidersHorizontal,
  半成品: Package,
};
const order = ['素菜', '荤菜', '水产', '早餐', '主食', '汤', '甜品', '饮品', '调味料', '半成品'];
export function Sidebar({
  manifest,
  route,
  navigate,
  open,
  close,
  favoriteCount,
}: {
  manifest: Manifest;
  route: Route;
  navigate: (r: Route) => void;
  open: boolean;
  close: () => void;
  favoriteCount: number;
}) {
  const cloud = useCloud();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('.close-sidebar')?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = [
        ...(panel.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') || []),
      ].filter((element) => element.getClientRects().length);
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
    };
  }, [open]);
  const go = (page: 'home' | 'favorites' | 'recent') => {
    navigate({ page, view: route.view, filters: { ...emptyFilters } });
    close();
  };
  const select = (category = '', source = '') => {
    navigate({
      ...route,
      page: 'library',
      id: undefined,
      from: undefined,
      filters: { ...route.filters, category, source },
    });
    close();
  };
  const categories = Object.keys(manifest.categories).sort(
    (a, b) =>
      (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) -
      (order.indexOf(b) < 0 ? 99 : order.indexOf(b)),
  );
  return (
    <>
      {open && (
        <button className="sidebar-scrim" tabIndex={-1} aria-label="关闭分类面板" onClick={close} />
      )}
      <aside
        ref={panel}
        id="recipe-sidebar"
        role={open ? 'dialog' : undefined}
        aria-modal={open || undefined}
        className={`sidebar ${open ? 'is-open' : ''}`}
        aria-label="菜谱分类"
      >
        <div className="brand">
          <a
            href="#/home"
            onClick={(e) => {
              e.preventDefault();
              go('home');
            }}
          >
            <ChefHat size={29} />
            <span>灶台笔记</span>
          </a>
          <small>KITCHEN NOTES</small>
          <button className="close-sidebar icon-button" aria-label="关闭分类" onClick={close}>
            <X size={22} />
          </button>
        </div>
        <nav className="primary-nav">
          <button
            className={route.page === 'home' ? 'active' : ''}
            aria-current={route.page === 'home' ? 'page' : undefined}
            onClick={() => go('home')}
          >
            <House size={20} />
            首页
          </button>
          <button
            className={
              route.page === 'library' && !route.filters.category && !route.filters.source
                ? 'active'
                : ''
            }
            aria-current={
              route.page === 'library' && !route.filters.category && !route.filters.source
                ? 'page'
                : undefined
            }
            onClick={() => select()}
          >
            <Grid2X2 size={20} />
            全部菜谱<span>{manifest.recipes.length}</span>
          </button>
          <button
            className={route.page === 'favorites' ? 'active' : ''}
            aria-current={route.page === 'favorites' ? 'page' : undefined}
            onClick={() => go('favorites')}
          >
            <Heart size={20} />
            我的收藏<span>{favoriteCount}</span>
          </button>
          <button
            className={route.page === 'recent' ? 'active' : ''}
            aria-current={route.page === 'recent' ? 'page' : undefined}
            onClick={() => go('recent')}
          >
            <History size={20} />
            最近浏览
          </button>
        </nav>
        {cloud.config.enabled && (
          <nav className="primary-nav cloud-nav" aria-label="小厨房互动">
            <button
              className={route.page === 'requests' ? 'active' : ''}
              onClick={() => {
                navigate({ ...route, page: 'requests', id: undefined });
                close();
              }}
            >
              点菜与投稿
            </button>
            <button
              className={route.page === 'add' ? 'active' : ''}
              onClick={() => {
                navigate({ ...route, page: 'add', id: undefined });
                close();
              }}
            >
              {cloud.admin ? '新增菜谱' : '分享菜谱'}
            </button>
            <button
              className={route.page === 'account' ? 'active' : ''}
              onClick={() => {
                navigate({ ...route, page: 'account', id: undefined });
                close();
              }}
            >
              {cloud.session && !cloud.session.user.is_anonymous ? '我的账号' : '登录 / 注册'}
            </button>
            {cloud.admin && (
              <button
                className={route.page === 'admin' ? 'active' : ''}
                onClick={() => {
                  navigate({ ...route, page: 'admin', id: undefined });
                  close();
                }}
              >
                管理员工作台
              </button>
            )}
          </nav>
        )}
        <div className="sidebar-section">
          <span>分类 · 全库数量</span>
          <nav>
            {categories.map((category) => {
              const Icon = icons[category] || BookOpen;
              return (
                <button
                  key={category}
                  className={
                    route.page === 'library' && route.filters.category === category ? 'active' : ''
                  }
                  aria-current={
                    route.page === 'library' && route.filters.category === category
                      ? 'page'
                      : undefined
                  }
                  onClick={() => select(category, route.filters.source)}
                >
                  <Icon size={19} />
                  {category}
                  <span>{manifest.categories[category]}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}
