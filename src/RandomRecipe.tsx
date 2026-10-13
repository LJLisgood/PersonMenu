import { useRef, useState } from 'react';
import { Shuffle, ArrowRight, X } from 'lucide-react';
import type { Recipe, Route } from './types';
import { recipeRoute, routeHash } from './state';
import { RecipeImage } from './RecipeCard';
export function RandomRecipe({
  recipes,
  route,
  filtered = false,
  disabled = false,
}: {
  recipes: Recipe[];
  route: Route;
  filtered?: boolean;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const previous = useRef<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const recipe = recipes.find((r) => r.id === selected);
  const pick = () => {
    const candidates =
      recipes.length > 1 ? recipes.filter((r) => r.id !== previous.current) : recipes;
    if (candidates.length) {
      const id = candidates[Math.floor(Math.random() * candidates.length)].id;
      previous.current = id;
      setSelected(id);
    }
  };
  return (
    <div className="random-picker">
      <button
        ref={trigger}
        className="button accent"
        onClick={pick}
        disabled={disabled || !recipes.length}
      >
        <Shuffle size={18} />
        {selected ? '再来一道' : '帮我选一道'}
      </button>
      {!recipes.length && !disabled && <small>没有可选菜谱，请清空筛选后再试。</small>}
      {recipe && !disabled && (
        <section key={recipe.id} className="random-result" aria-label="随机推荐结果">
          <RecipeImage key={recipe.id} recipe={recipe} />
          <div>
            <small>
              {filtered ? '从当前筛选结果推荐' : '今晚不妨试试'}
              {recipes.length === 1 ? ' · 仅此一道' : ''}
            </small>
            <h3 aria-live="polite">{recipe.name}</h3>
            <a className="text-button" href={routeHash(recipeRoute(route, recipe.id))}>
              查看做法
              <ArrowRight size={16} />
            </a>
          </div>
          <button
            className="icon-button"
            aria-label="收起推荐"
            onClick={() => {
              setSelected(null);
              trigger.current?.focus();
            }}
          >
            <X size={18} />
          </button>
        </section>
      )}
    </div>
  );
}
