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
import { emptyFilters, routeHash, recipeRoute, saveView, ingredientTerms } from './state';
import { useSearch } from './useSearch';
import { RecipeCard } from './RecipeCard';
import { usePersonal } from './PersonalState';
import { RandomRecipe } from './RandomRecipe';
const positions = new Map<string, { top: number; limit: number; href?: string }>();
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
    <details
      className={`filter-menu ${active ? 'selected' : ''}`}
      onToggle={(event) => {
        const current = event.currentTarget;
        if (current.open)
          document.querySelectorAll<HTMLDetailsElement>('.filter-menu[open]').forEach((other) => {
            if (other !== current) other.open = false;
          });
      }}
    >
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
  const {
    ids: searchedIds,
    error,
    busy,
    ready,
    duration,
    resultKey,
  } = useSearch(manifest, route.filters);
  const { saved, clearRecent } = usePersonal();
  const recipes = new Map(manifest.recipes.map((r) => [r.id, r]));
  const included = ingredientTerms(route.filters.include);
  const excluded = ingredientTerms(route.filters.exclude);
  // Exclusion is substring matching: including 牛奶 also conflicts with excluding 奶.
  const conflicts = included.filter((term) => excluded.some((omit) => term.includes(omit)));
  const fresh = !busy && resultKey === JSON.stringify(route.filters);
  let ids = conflicts.length ? [] : searchedIds;
  if (route.page === 'favorites') ids = ids.filter((id) => saved.favorites.includes(id));
  if (route.page === 'recent') {
    const allowed = new Set(ids);
    ids = saved.recent.map((entry) => entry.id).filter((id) => allowed.has(id));
  }
  if (route.sort)
    ids = [...ids].sort((a, b) => {
      const first = recipes.get(a)!,
        second = recipes.get(b)!;
      if (route.sort === 'name') return first.name.localeCompare(second.name, 'zh-CN');
      const field = route.sort === 'time' ? 'totalMinutes' : 'difficulty';
      return (
        (first[field] ?? Infinity) - (second[field] ?? Infinity) ||
        first.name.localeCompare(second.name, 'zh-CN')
      );
    });
  const positionKey = JSON.stringify([route.page, route.filters, route.sort]);
  const pendingRestore = useRef<string | null>(positionKey);
  const [composing, setComposing] = useState(false);
  const [query, setQuery] = useState(route.filters.q);
  const [limit, setLimit] = useState(() => positions.get(positionKey)?.limit || 24);
  const limitRef = useRef(limit);
  limitRef.current = limit;
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
    if (composing || query === route.filters.q) return;
    const timeout = setTimeout(() => {
      expectedQuery.current = query;
      navigate({ ...route, filters: { ...route.filters, q: query } }, true);
    }, 200);
    return () => clearTimeout(timeout);
  }, [query, route, navigate, composing]);
  useLayoutEffect(() => {
    pendingRestore.current = positionKey;
    setLimit(positions.get(positionKey)?.limit || 24);
    const remember = () => {
      if (pendingRestore.current !== null) return;
      if (positions.size >= 80 && !positions.has(positionKey))
        positions.delete(positions.keys().next().value!);
      positions.set(positionKey, {
        ...positions.get(positionKey),
        top: window.scrollY,
        limit: limitRef.current,
      });
    };
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, [positionKey]);
  useLayoutEffect(() => {
    if (!fresh || pendingRestore.current !== positionKey) return;
    const frame = requestAnimationFrame(() => {
      const previous = positions.get(positionKey);
      window.scrollTo({ top: previous?.top || 0, behavior: 'instant' });
      if (previous?.href)
        [...document.querySelectorAll<HTMLAnchorElement>('.recipe-card-link')]
          .find((a) => a.getAttribute('href') === previous.href)
          ?.focus({ preventScroll: true });
      pendingRestore.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [fresh, positionKey, limit]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName) &&
        !(event.target as HTMLElement).isContentEditable
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
  const hasFilters = Object.values(route.filters).some(Boolean);
  const title =
    (route.page === 'favorites' ? '我的收藏' : route.page === 'recent' ? '最近浏览' : '') ||
    route.filters.category ||
    (route.filters.source === 'personal' ? '我的菜谱' : route.filters.q ? '搜索结果' : '全部菜谱');
  return (
    <>
      <header className="library-header">
        <div>
          <span className="eyebrow">YOUR EVERYDAY COOKBOOK</span>
          <h1>{title}</h1>
          <p>
            {route.page === 'favorites'
              ? '把喜欢的味道留住。收藏仅保存在当前浏览器。'
              : route.page === 'recent'
                ? '真实打开过的菜谱，按最近访问排列，仅保存在当前浏览器。'
                : `全库 ${manifest.recipes.length} 道菜谱，按今天的心情和冰箱里的食材来选。`}
          </p>
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
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={(e) => {
            setComposing(false);
            setQuery(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              expectedQuery.current = query;
              navigate({ ...route, filters: { ...route.filters, q: query } }, true);
            }
          }}
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
      {hasFilters && (
        <div className="active-filters">
          {Object.entries(route.filters)
            .filter(([, v]) => v)
            .map(([key, value]) => (
              <button key={key} onClick={() => patch({ [key]: '' })}>
                {
                  (
                    {
                      q: '搜索',
                      category: '分类',
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
      {conflicts.length > 0 && (
        <div className="filter-conflict" role="status">
          <p>食材条件冲突：要求包含「{conflicts.join('、')}」，同时又排除了它或其中的文字。</p>
          <button
            className="button subtle"
            onClick={() =>
              patch({
                exclude: excluded
                  .filter((term) => !included.some((item) => item.includes(term)))
                  .join(', '),
              })
            }
          >
            移除冲突的排除条件
          </button>
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
              {error ? '检索失败' : !fresh ? '检索中…' : `${ids.length} 道`}
            </span>
          </div>
          <div className="result-actions">
            {route.page === 'recent' && saved.recent.length > 0 && (
              <button className="text-button" onClick={clearRecent}>
                清空浏览记录
              </button>
            )}
            <label className="sort-control">
              <span className="sr-only">排序方式</span>
              <select
                aria-label="排序方式"
                value={route.sort || ''}
                onChange={(e) =>
                  navigate({ ...route, sort: (e.target.value || undefined) as Route['sort'] })
                }
              >
                <option value="">{route.page === 'recent' ? '最近浏览' : '默认排序'}</option>
                <option value="name">按名称</option>
                {manifest.recipes.some((r) => r.totalMinutes !== null) && (
                  <option value="time">耗时从短到长</option>
                )}
                {manifest.recipes.some((r) => r.difficulty !== null) && (
                  <option value="difficulty">难度从低到高</option>
                )}
              </select>
            </label>
            <div className="view-toggle">
              <button
                aria-label="卡片视图"
                aria-pressed={route.view === 'grid'}
                onClick={() => {
                  saveView('grid');
                  navigate({ ...route, view: 'grid' });
                }}
              >
                <Grid2X2 size={20} />
              </button>
              <button
                aria-label="列表视图"
                aria-pressed={route.view === 'list'}
                onClick={() => {
                  saveView('list');
                  navigate({ ...route, view: 'list' });
                }}
              >
                <List size={22} />
              </button>
            </div>
          </div>
        </div>
        <div className="library-random">
          <RandomRecipe
            key={positionKey}
            recipes={ids.flatMap((id) => (recipes.get(id) ? [recipes.get(id)!] : []))}
            route={route}
            filtered={hasFilters || route.page !== 'library'}
            disabled={!fresh || !!error}
          />
        </div>
        {error ? (
          <div className="notice error">
            {error}
            <button onClick={() => location.reload()}>重新加载</button>
          </div>
        ) : !fresh ? (
          <div className="skeleton-grid" aria-label="正在加载菜谱">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="skeleton-card" />
            ))}
          </div>
        ) : ids.length === 0 ? (
          <div className="empty-state">
            <Search size={38} />
            <h3>
              {route.page === 'favorites' && !saved.favorites.length
                ? '还没有收藏菜谱'
                : route.page === 'recent' && !saved.recent.length
                  ? '还没有浏览记录'
                  : route.filters.source === 'personal' &&
                      manifest.recipes.every((r) => r.source !== 'personal')
                    ? '留下你的第一道家常菜'
                    : '没有找到符合条件的菜谱'}
            </h3>
            <p>
              {route.page === 'favorites' && !saved.favorites.length
                ? '点击菜谱卡片上的爱心，把想做的菜留在这里。'
                : route.page === 'recent' && !saved.recent.length
                  ? '打开一道菜谱后，就会在这里留下记录。'
                  : '试试减少筛选条件，或换一个菜名、食材关键词。'}
            </p>
            <div className="empty-actions">
              {hasFilters && (
                <button
                  className="button primary"
                  onClick={() => {
                    setQuery('');
                    navigate({ ...route, filters: { ...emptyFilters } });
                  }}
                >
                  清空筛选
                </button>
              )}
              {(route.page === 'favorites' || route.page === 'recent') && (
                <a
                  className="button primary"
                  href={routeHash({
                    page: 'library',
                    filters: { ...emptyFilters },
                    view: route.view,
                  })}
                >
                  去发现菜谱
                </a>
              )}
              <a href={routeHash({ ...route, page: 'add' })} className="button subtle">
                添加自己的菜谱
              </a>
            </div>
          </div>
        ) : (
          <div
            className={`recipe-grid ${route.view === 'list' ? 'list-view' : ''}`}
            aria-busy={busy}
            onClickCapture={(event) => {
              const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
                '.recipe-card-link',
              );
              if (link)
                positions.set(positionKey, {
                  top: window.scrollY,
                  limit,
                  href: link.getAttribute('href') || undefined,
                });
            }}
          >
            {ids.slice(0, limit).map((id) => {
              const recipe = recipes.get(id);
              return recipe ? (
                <RecipeCard key={id} recipe={recipe} href={routeHash(recipeRoute(route, id))} />
              ) : null;
            })}
          </div>
        )}
        {fresh && !error && ids.length > limit && (
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
