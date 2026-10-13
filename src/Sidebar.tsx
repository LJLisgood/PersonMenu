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
  UserRound,
  ExternalLink,
  X,
} from 'lucide-react';
import type { Manifest, Route } from './types';
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
            className={
              route.page === 'library' &&
              route.filters.source === 'personal' &&
              !route.filters.category
                ? 'active'
                : ''
            }
            aria-current={
              route.page === 'library' &&
              route.filters.source === 'personal' &&
              !route.filters.category
                ? 'page'
                : undefined
            }
            onClick={() => select('', 'personal')}
          >
            <UserRound size={20} />
            我的菜谱<span>{manifest.recipes.filter((r) => r.source === 'personal').length}</span>
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
        <div className="sidebar-footer">
          <span>菜谱来源</span>
          <a href="https://github.com/Anduin2017/HowToCook" target="_blank" rel="noreferrer">
            <BookOpen size={18} />
            HowToCook
            <ExternalLink size={15} />
          </a>
          <small>收藏与浏览记录仅存于此浏览器。</small>
        </div>
      </aside>
    </>
  );
}
