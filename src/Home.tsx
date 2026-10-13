import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Search, Leaf } from 'lucide-react';
import type { Manifest, Route } from './types';
import { dailyRecipes, emptyFilters, recipeRoute, routeHash } from './state';
import { RecipeCard, RecipeImage } from './RecipeCard';
import { RandomRecipe } from './RandomRecipe';
import { usePersonal } from './PersonalState';
let homePosition = 0;
let homeFocus = '';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
export function Home({
  manifest,
  route,
  navigate,
}: {
  manifest: Manifest;
  route: Route;
  navigate: (route: Route) => void;
}) {
  const [query, setQuery] = useState('');
  useLayoutEffect(() => {
    let restored = false;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: homePosition, behavior: 'instant' });
      if (homeFocus)
        [...document.querySelectorAll<HTMLAnchorElement>('.home-page a')]
          .find((a) => a.getAttribute('href') === homeFocus)
          ?.focus({ preventScroll: true });
      restored = true;
    });
    const remember = () => {
      if (restored) homePosition = window.scrollY;
    };
    window.addEventListener('scroll', remember, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', remember);
    };
  }, []);
  const [date, setDate] = useState(today);
  useEffect(() => {
    const timer = window.setInterval(() => setDate(today()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const { saved } = usePersonal();
  const recommended = useMemo(
    () => dailyRecipes(manifest.recipes, date).slice(0, 4),
    [manifest.recipes, date],
  );
  const hero = recommended.find((r) => r.cover) || manifest.recipes.find((r) => r.cover);
  const recent = saved.recent
    .flatMap((entry) => {
      const recipe = manifest.recipes.find((r) => r.id === entry.id);
      return recipe ? [recipe] : [];
    })
    .slice(0, 6);
  const library: Route = { page: 'library', filters: { ...emptyFilters }, view: route.view };
  return (
    <div
      className="home-page"
      onClickCapture={(event) => {
        const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a');
        if (link) {
          homePosition = window.scrollY;
          homeFocus = link.getAttribute('href') || '';
        }
      }}
    >
      <header className="home-topline">
        <span>
          <Leaf size={16} />
          把日子过成喜欢的味道
        </span>
        <a className="text-button" href={routeHash(library)}>
          全部菜谱
          <ArrowRight size={16} />
        </a>
      </header>
      <section className={`home-hero ${hero ? 'has-image' : ''}`}>
        {hero && <RecipeImage recipe={hero} eager className="hero-photo" />}
        <div className="hero-content">
          <span className="eyebrow">A LITTLE INSPIRATION, EVERY DAY</span>
          <h1>今天，做点好吃的。</h1>
          <p>从 {manifest.recipes.length} 道菜谱里，找到今天的灵感。</p>
          <form
            className="search-field hero-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              navigate({ ...library, filters: { ...emptyFilters, q: query.trim() } });
            }}
          >
            <Search size={21} />
            <input
              aria-label="搜索菜名、食材或做法"
              type="search"
              placeholder="一道菜、一种食材，都可以…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault();
              }}
            />
            <button className="icon-button" type="submit" aria-label="搜索菜谱">
              <ArrowRight size={20} />
            </button>
          </form>
        </div>
        {hero && (
          <a className="hero-caption" href={routeHash(recipeRoute(route, hero.id))}>
            {hero.name}
            <ArrowRight size={14} />
          </a>
        )}
      </section>
      <section className="inspiration-bar" aria-label="今晚吃什么">
        <div>
          <h2>今晚吃什么？</h2>
          <p>偶尔，把选择交给一点小惊喜。</p>
        </div>
        <RandomRecipe recipes={manifest.recipes} route={route} />
      </section>
      <nav className="quick-categories" aria-label="快捷分类">
        {Object.entries(manifest.categories).map(([category, count]) => (
          <a
            key={category}
            href={routeHash({ ...library, filters: { ...emptyFilters, category } })}
          >
            <BookOpen size={17} />
            <span>{category}</span>
            <small>{count}</small>
          </a>
        ))}
      </nav>
      <section className="home-section">
        <div className="section-heading">
          <div>
            <h2>今日推荐</h2>
            <span>每日换一道灵感</span>
          </div>
          <a className="text-button" href={routeHash(library)}>
            探索全部
            <ArrowRight size={16} />
          </a>
        </div>
        <p className="section-description">按本机日期每日挑选，不妨从这里开始。</p>
        <div className="recipe-grid home-grid">
          {recommended.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              href={routeHash(recipeRoute(route, recipe.id))}
            />
          ))}
        </div>
        {!recommended.length && (
          <p className="empty-state">还没有菜谱。添加本地菜谱后，就能在这里找到灵感。</p>
        )}
      </section>
      {recent.length > 0 && (
        <section className="home-section">
          <div className="section-heading">
            <div>
              <h2>最近浏览</h2>
              <span>接着上次的灵感</span>
            </div>
            <a className="text-button" href={routeHash({ ...library, page: 'recent' })}>
              查看记录
              <ArrowRight size={16} />
            </a>
          </div>
          <div className="recipe-grid home-grid">
            {recent.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                href={routeHash(recipeRoute(route, recipe.id))}
              />
            ))}
          </div>
        </section>
      )}
      <a className="explore-banner" href={routeHash(library)}>
        <BookOpen size={27} />
        <div>
          <h2>你的下一道拿手菜，藏在这里。</h2>
          <p>浏览全部 {manifest.recipes.length} 道菜谱，按食材与难度慢慢挑。</p>
        </div>
        <ArrowRight size={24} />
      </a>
      <footer className="page-footer">
        每一餐，都值得认真对待。<span>收藏与浏览记录仅保存在当前浏览器</span>
      </footer>
    </div>
  );
}
