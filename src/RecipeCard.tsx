import { useState } from 'react';
import { ArrowUpRight, CookingPot, Heart, Clock } from 'lucide-react';
import { assetUrl } from './state';
import { usePersonal } from './PersonalState';
import type { Recipe } from './types';
export function Difficulty({ value }: { value: number | null }) {
  return (
    <span className="difficulty" aria-label={value ? `难度 ${value} 星` : '难度未提供'}>
      {value ? (
        <>
          <span aria-hidden="true">{'★'.repeat(value)}</span>
          <span className="difficulty-label">难度 {value}/5</span>
        </>
      ) : (
        '难度未提供'
      )}
    </span>
  );
}
export function RecipeImage({
  recipe,
  eager = false,
  className = '',
}: {
  recipe: Recipe;
  eager?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className={`recipe-photo ${className}`}>
      {recipe.cover && failed !== recipe.cover ? (
        <img
          src={assetUrl(recipe.cover)}
          alt={`${recipe.name}成品图`}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : 'auto'}
          width="640"
          height="480"
          onError={() => setFailed(recipe.cover)}
        />
      ) : (
        <div className="photo-placeholder">
          <CookingPot strokeWidth={1.2} size={44} />
          <span>{recipe.name}</span>
          <small>{failed ? '图片暂时无法加载' : '暂无成品照片'}</small>
          {failed && (
            <button
              className="text-button"
              onClick={(e) => {
                e.preventDefault();
                setFailed(null);
              }}
            >
              重试图片
            </button>
          )}
        </div>
      )}
    </div>
  );
}
export function FavoriteButton({ recipe, compact = false }: { recipe: Recipe; compact?: boolean }) {
  const { saved, toggle } = usePersonal();
  const active = saved.favorites.includes(recipe.id);
  return (
    <button
      className={`favorite-button ${compact ? 'compact' : 'button subtle'} ${active ? 'is-saved' : ''}`}
      aria-label={`${active ? '取消收藏' : '收藏'}${recipe.name}`}
      aria-pressed={active}
      onClick={() => toggle(recipe.id, recipe.name)}
    >
      <Heart size={19} fill={active ? 'currentColor' : 'none'} />
      {!compact && (active ? '已收藏' : '收藏菜谱')}
    </button>
  );
}
export function RecipeCard({
  recipe,
  href,
  eager = false,
}: {
  recipe: Recipe;
  href: string;
  eager?: boolean;
}) {
  return (
    <article className="recipe-card">
      <RecipeImage recipe={recipe} eager={eager} />
      <div className="card-content">
        <h3>
          <a className="recipe-card-link" href={href}>
            {recipe.name}
            <ArrowUpRight className="card-arrow" size={16} />
          </a>
        </h3>
        <div className="recipe-meta">
          <span>{recipe.category}</span>
          {recipe.difficulty !== null && <Difficulty value={recipe.difficulty} />}
          {recipe.totalMinutes !== null && (
            <span>
              <Clock size={13} />
              {recipe.totalMinutes} 分钟
            </span>
          )}
        </div>
        {recipe.description && <p>{recipe.description}</p>}
        {recipe.tags.length > 0 && (
          <div className="card-tags">
            {recipe.tags.slice(0, 3).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        )}
      </div>
      <FavoriteButton recipe={recipe} compact />
    </article>
  );
}
