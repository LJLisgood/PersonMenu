import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Grid2X2,
  List,
  ChevronDown,
  SlidersHorizontal,
  X,
  RotateCcw,
  Leaf,
  Ban,
  Tag,
  Signal,
} from 'lucide-react';
import type { Filters, Manifest, Route } from './types';
import { emptyFilters, routeHash } from './state';
import { useSearch } from './useSearch';
import { RecipeCard } from './RecipeCard';
function FilterMenu({
  title,
  icon,
  active,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className={`filter-menu ${active ? 'selected' : ''}`}>
      <summary>
        {icon}
        <span>{title}</span>
        <ChevronDown size={15} />
      </summary>
      <div className="filter-popover">{children}</div>
    </details>
  );
}
export function Library({
  manifest,
  route,
  navigate,
  openSidebar,
}: {
  manifest: Manifest;
  route: Route;
  navigate: (r: Route, replace?: boolean) => void;
  openSidebar: () => void;
}) {
  const { ids, error, busy, ready, duration, resultKey } = useSearch(manifest, route.filters);
  const [query, setQuery] = useState(route.filters.q);
  const [limit, setLimit] = useState(24);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchStarted = useRef<number | null>(null);
  const [latency, setLatency] = useState(0);
  useLayoutEffect(() => {
    if (
      !busy &&
      resultKey === JSON.stringify(route.filters) &&
      searchStarted.current !== null &&
      query === route.filters.q
    ) {
      setLatency(performance.now() - searchStarted.current);
      searchStarted.current = null;
    }
  }, [busy, resultKey, route.filters, query]);
  const expectedQuery = useRef<string | null>(null);
  useEffect(() => {
    if (expectedQuery.current === route.filters.q) {
      expectedQuery.current = null;
    } else setQuery(route.filters.q);
  }, [route.filters.q]);
  useEffect(() => {
    if (query === route.filters.q) return;
    const timeout = setTimeout(() => {
      expectedQuery.current = query;
      navigate({ ...route, filters: { ...route.filters, q: query } }, true);
    }, 30);
    return () => clearTimeout(timeout);
  }, [query, route, navigate]);
  useEffect(() => {
    setLimit(24);
  }, [route.filters]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)
      ) {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, []);
  useEffect(() => {
    const close = (event: MouseEvent) =>
      document.querySelectorAll<HTMLDetailsElement>('.filter-menu[open]').forEach((d) => {
        if (!d.contains(event.target as Node)) d.open = false;
      });
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        document.querySelectorAll<HTMLDetailsElement>('.filter-menu[open]').forEach((d) => {
          d.open = false;
          d.querySelector<HTMLElement>('summary')?.focus();
        });
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  const patch = (changes: Partial<Filters>) => {
    searchStarted.current = performance.now();
    navigate({ ...route, filters: { ...route.filters, ...changes } });
  };
  const recipes = new Map(manifest.recipes.map((r) => [r.id, r]));
  const hasFilters = Object.values(route.filters).some(Boolean);
  const title =
    route.filters.category ||
    (route.filters.source === 'personal' ? '我的菜谱' : route.filters.q ? '搜索结果' : '全部菜谱');
  return (
    <>
      <header className="library-header">
        <div>
          <h1>今天，做点好吃的。</h1>
          <p>从 {manifest.recipes.length} 道菜谱里，找到今天的灵感。</p>
        </div>
        <a
          className="button outline-orange"
          href={routeHash({ ...route, page: 'add', id: undefined })}
        >
          <Plus size={18} />
          新增菜谱
        </a>
      </header>
      <div className="search-field">
        <Search size={24} />
        <input
          ref={searchInput}
          value={query}
          onChange={(e) => {
            searchStarted.current = performance.now();
            setQuery(e.target.value);
          }}
          placeholder="搜索菜名、食材或做法，支持拼音…"
          aria-label="搜索菜谱"
          type="search"
        />
        {query ? (
          <button
            className="icon-button"
            onClick={() => {
              setQuery('');
              patch({ q: '' });
              searchInput.current?.focus();
            }}
            aria-label="清空搜索"
          >
            <X size={19} />
          </button>
        ) : (
          <kbd>/</kbd>
        )}
      </div>
      <div className="mobile-controls">
        <button className="button subtle" onClick={openSidebar}>
          <List size={18} />
          {route.filters.category || '全部分类'}
        </button>
        <button
          className="button subtle"
          onClick={() => setFiltersOpen(!filtersOpen)}
          aria-expanded={filtersOpen}
        >
          <SlidersHorizontal size={18} />
          筛选
        </button>
      </div>
      <div className={`filter-toolbar ${filtersOpen ? 'expanded' : ''}`}>
        <FilterMenu
          title={route.filters.difficulty ? `${route.filters.difficulty} 星难度` : '难度'}
          icon={<Signal size={18} />}
          active={!!route.filters.difficulty}
        >
          <label>
            烹饪难度
            <select
              aria-label="烹饪难度"
              value={route.filters.difficulty}
              onChange={(e) => patch({ difficulty: e.target.value })}
            >
              <option value="">全部难度</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} 星
                </option>
              ))}
            </select>
          </label>
          <small>没有标注难度的菜谱仅在“全部难度”中显示。</small>
        </FilterMenu>
        <FilterMenu
          title={route.filters.tag || '标签'}
          icon={<Tag size={18} />}
          active={!!route.filters.tag}
        >
          <label>
            菜谱标签
            <select
              aria-label="菜谱标签"
              value={route.filters.tag}
              onChange={(e) => patch({ tag: e.target.value })}
            >
              <option value="">全部标签</option>
              {manifest.tags.map((tag) => (
                <option key={tag}>{tag}</option>
              ))}
            </select>
          </label>
          {manifest.tags.length === 0 && <small>添加个人菜谱的 tags 后，可在这里筛选。</small>}
        </FilterMenu>
        <FilterMenu title="包含食材" icon={<Leaf size={18} />} active={!!route.filters.include}>
          <label>
            全部包含
            <input
              aria-label="包含食材"
              placeholder="例如：鸡蛋, 西红柿"
              value={route.filters.include}
              onChange={(e) => patch({ include: e.target.value })}
            />
          </label>
          <small>多个食材用逗号分隔，全部匹配才显示。</small>
        </FilterMenu>
        <FilterMenu title="排除食材" icon={<Ban size={18} />} active={!!route.filters.exclude}>
          <label>
            排除任一食材
            <input
              aria-label="排除食材"
              placeholder="例如：花生, 牛奶"
              value={route.filters.exclude}
              onChange={(e) => patch({ exclude: e.target.value })}
            />
          </label>
          <small>按菜谱原料文字匹配，仅作为检索条件。</small>
        </FilterMenu>
        {hasFilters && (
          <button
            className="reset-filters"
            onClick={() => {
              setQuery('');
              navigate({ ...route, filters: { ...emptyFilters } });
            }}
          >
            <RotateCcw size={15} />
            重置
          </button>
        )}
      </div>
      {(route.filters.include ||
        route.filters.exclude ||
        route.filters.tag ||
        route.filters.difficulty ||
        route.filters.source) && (
        <div className="active-filters">
          {Object.entries(route.filters)
            .filter(([k, v]) => v && k !== 'q' && k !== 'category')
            .map(([key, value]) => (
              <button key={key} onClick={() => patch({ [key]: '' })}>
                {
                  (
                    {
                      include: '包含',
                      exclude: '排除',
                      tag: '标签',
                      difficulty: '难度',
                      source: '来源',
                    } as Record<string, string>
                  )[key]
                }
                ：{key === 'source' ? '我的菜谱' : value}
                <X size={13} />
              </button>
            ))}
        </div>
      )}
      <section
        className="library-section"
        aria-label="菜谱搜索结果"
        data-search-duration={duration}
        data-search-latency={latency}
        data-result-key={resultKey}
        data-search-ready={ready}
      >
        <div className="section-heading">
          <div>
            <h2>{title}</h2>
            <span role="status" aria-live="polite">
              {busy ? '检索中…' : `${ids.length} 道`}
            </span>
          </div>
          <div className="view-toggle">
            <button
              aria-label="卡片视图"
              aria-pressed={route.view === 'grid'}
              onClick={() => navigate({ ...route, view: 'grid' })}
            >
              <Grid2X2 size={20} />
            </button>
            <button
              aria-label="列表视图"
              aria-pressed={route.view === 'list'}
              onClick={() => navigate({ ...route, view: 'list' })}
            >
              <List size={22} />
            </button>
          </div>
        </div>
        {error ? (
          <div className="notice error">
            {error}
            <button onClick={() => location.reload()}>重新加载</button>
          </div>
        ) : !ready ? (
          <div className="skeleton-grid" aria-label="正在加载菜谱">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="skeleton-card" />
            ))}
          </div>
        ) : ids.length === 0 ? (
          <div className="empty-state">
            <Search size={38} />
            <h3>
              {route.filters.source === 'personal' && !hasFilters
                ? '留下你的第一道家常菜'
                : '还没有找到合适的菜谱'}
            </h3>
            <p>试试减少筛选条件，或换一个菜名、食材关键词。</p>
            <a href={routeHash({ ...route, page: 'add' })} className="button subtle">
              添加自己的菜谱
            </a>
          </div>
        ) : (
          <div
            className={`recipe-grid ${route.view === 'list' ? 'list-view' : ''}`}
            aria-busy={busy}
          >
            {ids.slice(0, limit).map((id) => {
              const recipe = recipes.get(id);
              return recipe ? (
                <RecipeCard
                  key={id}
                  recipe={recipe}
                  href={routeHash({ ...route, page: 'recipe', id })}
                />
              ) : null;
            })}
          </div>
        )}
        {ids.length > limit && (
          <div className="load-more">
            <button className="button subtle" onClick={() => setLimit(limit + 24)}>
              再看 24 道菜
              <ChevronDown size={16} />
            </button>
            <small>
              已显示 {Math.min(limit, ids.length)} / {ids.length} 道
            </small>
          </div>
        )}
      </section>
      <footer className="page-footer">
        每一餐，都值得认真对待。<span>菜谱来自 HowToCook 与你的本地收藏</span>
      </footer>
    </>
  );
}
