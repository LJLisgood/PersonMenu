import {
  BookOpen,
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
}: {
  manifest: Manifest;
  route: Route;
  navigate: (r: Route) => void;
  open: boolean;
  close: () => void;
}) {
  const select = (category = '', source = '') => {
    navigate({
      ...route,
      page: 'library',
      id: undefined,
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
      {open && <button className="sidebar-scrim" aria-label="关闭分类面板" onClick={close} />}
      <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="菜谱分类">
        <div className="brand">
          <a
            href="#/"
            onClick={(e) => {
              e.preventDefault();
              select();
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
            className={!route.filters.category && !route.filters.source ? 'active' : ''}
            onClick={() => select()}
          >
            <Grid2X2 size={20} />
            全部菜谱<span>{manifest.recipes.length}</span>
          </button>
          <button
            className={
              route.filters.source === 'personal' && !route.filters.category ? 'active' : ''
            }
            onClick={() => select('', 'personal')}
          >
            <UserRound size={20} />
            我的菜谱<span>{manifest.recipes.filter((r) => r.source === 'personal').length}</span>
          </button>
        </nav>
        <div className="sidebar-section">
          <span>分类</span>
          <nav>
            {categories.map((category) => {
              const Icon = icons[category] || BookOpen;
              return (
                <button
                  key={category}
                  className={route.filters.category === category ? 'active' : ''}
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
          <small>本地收藏，慢慢做好每一餐。</small>
        </div>
      </aside>
    </>
  );
}
