import { ArrowUpRight, CookingPot } from 'lucide-react';
import { assetUrl } from './state';
import type { Recipe } from './types';
export function Difficulty({ value }: { value: number | null }) {
  return (
    <span className="difficulty" aria-label={value ? `难度 ${value} 星` : '难度未提供'}>
      {value ? (
        <>
          <span>{'★'.repeat(value)}</span>
          <span className="muted-star">{'☆'.repeat(5 - value)}</span>
        </>
      ) : (
        '难度未提供'
      )}
    </span>
  );
}
export function RecipeCard({ recipe, href }: { recipe: Recipe; href: string }) {
  return (
    <a className="recipe-card" href={href}>
      <div className="recipe-photo">
        {recipe.cover ? (
          <img
            src={assetUrl(recipe.cover)}
            alt={recipe.name}
            loading="lazy"
            width="640"
            height="420"
          />
        ) : (
          <div className="photo-placeholder">
            <CookingPot strokeWidth={1.2} size={52} />
            <span>{recipe.category} · 家常味道</span>
          </div>
        )}
        <span className="card-open">
          <ArrowUpRight size={19} />
        </span>
      </div>
      <div className="card-content">
        <h3>{recipe.name}</h3>
        <div className="recipe-meta">
          <span>{recipe.category}</span>
          <i />
          <Difficulty value={recipe.difficulty} />
          {recipe.totalMinutes && <span>{recipe.totalMinutes} 分钟</span>}
        </div>
        <p>{recipe.description || '从备料到出锅，把一道家常菜认真做好。'}</p>
        {recipe.tags.length > 0 && (
          <div className="card-tags">
            {recipe.tags.slice(0, 3).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}
